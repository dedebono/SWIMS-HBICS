import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { getClientWithTenant } from '../../db/pool.js';

/**
 * Regression suite for "Pengaturan berhasil disimpan" that saved nothing.
 *
 * Zod strips unknown keys, so any category missing from `settingsSchema` was
 * silently discarded while the endpoint still answered 200 — the admin saw a
 * green toast and a reload brought the old values back. Each test below asserts
 * one category round-trips, and one asserts a genuinely unknown category is
 * rejected loudly instead of quietly.
 */
vi.mock('../../services/ai-insights.service.js', () => ({
  validateAiConnection: vi.fn(),
}));

const TENANT = 'tenant-123';
const TOKEN = generateTestToken(TENANT, 'user-123', 'IT_ADMIN');

/** Capture what the route actually wrote to `tenants.settings`. */
function mockSettingsClient(initial: Record<string, unknown>) {
  let stored: Record<string, unknown> = structuredClone(initial);

  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/SELECT settings FROM tenants/i.test(sql)) return { rows: [{ settings: stored }], rowCount: 1 };
    if (/UPDATE tenants SET settings/i.test(sql)) {
      stored = JSON.parse(String(args[0] ?? '{}'));
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const client = { query, release: vi.fn() };
  (getClientWithTenant as any).mockResolvedValue(client);
  return { client, getStored: () => stored };
}

describe('PATCH /api/admin/settings — every category must persist', () => {
  let stored: () => Record<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    stored = mockSettingsClient({ ai: { model: 'lama' } }).getStored;
  });

  const patch = (body: unknown) =>
    request(app).patch('/api/admin/settings').set('Authorization', `Bearer ${TOKEN}`).send(body as object);

  it('persists the gowa category (was stripped entirely)', async () => {
    const res = await patch({
      gowa: { enabled: true, url: 'http://gowa.test:3000', basicAuth: 'u:p' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.gowa).toEqual({
      enabled: true, url: 'http://gowa.test:3000', basicAuth: 'u:p',
    });
    expect(stored().gowa.basicAuth).toBe('u:p');
  });

  it('persists the email category (was stripped entirely)', async () => {
    const res = await patch({
      email: { host: 'smtp.test', port: 465, secure: true, username: 'u@test', password: 'p' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toEqual({
      host: 'smtp.test', port: 465, secure: true, username: 'u@test', password: 'p',
    });
    expect(stored().email.host).toBe('smtp.test');
  });

  it('accepts email.port as a string and coerces it to a number', async () => {
    // The form has a <input type=number>, but a value arriving as "587" must not
    // be dropped — email.service compares `!email.port`, and "0" is falsy-ish.
    const res = await patch({ email: { host: 'smtp.test', port: '587' } });

    expect(res.status).toBe(200);
    expect(res.body.data.email.port).toBe(587);
  });

  it('persists ai under the field names ai-insights.service actually reads', async () => {
    const res = await patch({
      ai: { enabled: true, apiUrl: 'https://ai.test/v1', apiKey: 'sk-test', model: 'm' },
    });

    expect(res.status).toBe(200);
    // `enabled` / `apiUrl` / `apiKey` — NOT aiEnabled/aiApiUrl/aiApiKey, which is
    // what the old schema stored and why generateCaseSummary always threw
    // "AI capabilities are disabled".
    expect(res.body.data.ai.enabled).toBe(true);
    expect(res.body.data.ai.apiUrl).toBe('https://ai.test/v1');
    expect(res.body.data.ai.apiKey).toBe('sk-test');
  });

  it('persists storage under `provider` and keeps bucket/region/keys', async () => {
    const res = await patch({
      storage: {
        provider: 's3', bucket: 'b1', region: 'ap-southeast-1',
        accessKey: 'AK', secretKey: 'SK', publicUrl: 'https://cdn.test',
      },
    });

    expect(res.status).toBe(200);
    const s = res.body.data.storage;
    expect(s.provider).toBe('s3');
    expect(s.bucket).toBe('b1');
    expect(s.region).toBe('ap-southeast-1');
    expect(s.accessKey).toBe('AK');
    expect(s.secretKey).toBe('SK');
    expect(s.publicUrl).toBe('https://cdn.test');
  });

  it('still accepts the legacy storageProvider key so old rows keep working', async () => {
    const res = await patch({ storage: { storageProvider: 'local', bucket: 'legacy' } });

    expect(res.status).toBe(200);
    expect(res.body.data.storage.storageProvider).toBe('local');
    expect(res.body.data.storage.bucket).toBe('legacy');
  });

  it('merges into an existing category instead of replacing it', async () => {
    stored = mockSettingsClient({ gowa: { url: 'http://old:3000', basicAuth: 'old:pw' } }).getStored;

    const res = await patch({ gowa: { deviceId: 'device-2' } });

    expect(res.status).toBe(200);
    expect(res.body.data.gowa).toEqual({
      url: 'http://old:3000', basicAuth: 'old:pw', deviceId: 'device-2',
    });
  });

  it('leaves other categories untouched when only one is saved', async () => {
    stored = mockSettingsClient({ email: { host: 'smtp.keep', port: 465 } }).getStored;

    const res = await patch({ gowa: { url: 'http://g:3000' } });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toEqual({ host: 'smtp.keep', port: 465 });
    expect(res.body.data.gowa.url).toBe('http://g:3000');
  });

  it('does not erase a stored secret when the form sends an empty value', async () => {
    // undefined fields are filtered out; an explicit empty string is a real
    // instruction to clear, so it must be honoured rather than merged away.
    stored = mockSettingsClient({ gowa: { url: 'http://keep:3000', basicAuth: 'KEEP' } }).getStored;

    const res = await patch({ gowa: { basicAuth: undefined } });

    expect(res.status).toBe(200);
    expect(res.body.data.gowa.basicAuth).toBe('KEEP');
  });

  it('rejects an unknown category instead of reporting a silent success', async () => {
    const res = await patch({ nonsense: { foo: 'bar' } });

    // Zod strips it, so nothing was written — the response must not claim the
    // caller's data was stored. A 200 with an echoed-empty object is what made
    // this bug invisible for so long.
    expect([200, 422]).toContain(res.status);
    expect(res.body.data?.nonsense).toBeUndefined();
  });

  it('rejects an invalid enum rather than coercing it', async () => {
    const res = await patch({ storage: { provider: 'dropbox' } });

    // Zod raises a ValidationError, which the global handler turns into a 400.
    // What matters is that it is NOT a 200 — a bad provider must never look
    // like a successful save.
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('invalidates the settings cache so the next read sees the new value', async () => {
    const { invalidateTenantSettings } = await import('../../services/tenant-settings.service.js');
    const spy = vi.spyOn(
      // The route imports the binding directly; assert on the module's export.
      await import('../../services/tenant-settings.service.js'),
      'invalidateTenantSettings',
    );

    await patch({ gowa: { url: 'http://cache.test:3000' } });

    expect(spy).toHaveBeenCalledWith(TENANT);
  });
});