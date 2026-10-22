import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../db/pool.js', () => ({
  getClientWithTenant: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({
  env: {
    GOWA_ENABLED: true,
    GOWA_API_URL: 'http://env-gowa:3000',
    GOWA_BASIC_AUTH: 'env-gowa-user:env-gowa-pass',
    GOWA_DEVICE_ID: '',
    S3_BUCKET: 'env-bucket',
    S3_REGION: 'env-region',
    S3_ACCESS_KEY: 'env-ak',
    S3_SECRET_KEY: 'env-sk',
    S3_ENDPOINT: '',
  },
}));

import { getClientWithTenant } from '../../db/pool.js';
import {
  getTenantSettings,
  getGowaSettings,
  getStorageSettings,
  getEmailSettings,
  getAiSettings,
  clearTenantSettingsCache,
  invalidateTenantSettings,
} from '../tenant-settings.service.js';

const TENANT = 'test-tenant-001';

function mockDbSettings(settings: Record<string, unknown> | null) {
  const client = {
    query: vi.fn().mockResolvedValue({
      rows: settings !== null ? [{ settings }] : [],
      rowCount: settings !== null ? 1 : 0,
    }),
    release: vi.fn(),
  };
  vi.mocked(getClientWithTenant).mockResolvedValue(client as any);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearTenantSettingsCache();
});

// ── getTenantSettings ────────────────────────────────────────────────────────

describe('getTenantSettings', () => {
  it('returns the parsed settings from DB', async () => {
    mockDbSettings({ ai: { enabled: true }, waha: { url: 'http://x' } });
    const s = await getTenantSettings(TENANT);
    expect(s.ai).toEqual({ enabled: true });
    expect(s.waha).toEqual({ url: 'http://x' });
  });

  it('returns {} when tenants row has null settings', async () => {
    mockDbSettings(null);
    // No rows → settings should be {}
    const s = await getTenantSettings(TENANT);
    expect(s).toEqual({});
  });

  it('parses a JSON string (text column fallback)', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ settings: '{"email":{"host":"smtp.test"}}' }],
        rowCount: 1,
      }),
      release: vi.fn(),
    };
    vi.mocked(getClientWithTenant).mockResolvedValue(client as any);

    const s = await getTenantSettings(TENANT);
    expect(s.email).toEqual({ host: 'smtp.test' });
  });
});

// ── Cache behaviour ──────────────────────────────────────────────────────────

describe('cache', () => {
  it('does not call the DB twice within the TTL', async () => {
    mockDbSettings({ ai: { enabled: true } });

    await getTenantSettings(TENANT);
    await getTenantSettings(TENANT);

    // Only one DB call despite two getTenantSettings calls.
    expect(getClientWithTenant).toHaveBeenCalledTimes(1);
  });

  it('clears the cache with clearTenantSettingsCache', async () => {
    mockDbSettings({ ai: { enabled: true } });
    await getTenantSettings(TENANT);

    clearTenantSettingsCache();
    mockDbSettings({ ai: { enabled: false } });
    const s = await getTenantSettings(TENANT);

    expect(s.ai).toEqual({ enabled: false });
    expect(getClientWithTenant).toHaveBeenCalledTimes(2);
  });

  it('invalidates only one tenant', async () => {
    const OTHER = 'other-tenant';
    mockDbSettings({ ai: { enabled: true } });
    await getTenantSettings(TENANT);
    await getTenantSettings(OTHER);

    // Two different tenants → 2 DB calls
    expect(getClientWithTenant).toHaveBeenCalledTimes(2);

    invalidateTenantSettings(TENANT);
    mockDbSettings({ ai: { enabled: false } });
    await getTenantSettings(TENANT);
    // OTHER is still cached, TENANT re-fetched → 3rd call
    expect(getClientWithTenant).toHaveBeenCalledTimes(3);
  });
});

// ── getGowaSettings ──────────────────────────────────────────────────────────

describe('getGowaSettings', () => {
  it('reads from DB settings when available', async () => {
    mockDbSettings({
      gowa: { enabled: true, url: 'http://db-gowa:3000', basicAuth: 'db-user:db-pass' },
    });
    const g = await getGowaSettings(TENANT);
    expect(g.enabled).toBe(true);
    expect(g.url).toBe('http://db-gowa:3000');
    expect(g.basicAuth).toBe('db-user:db-pass');
  });

  it('falls back to env when DB settings are empty', async () => {
    mockDbSettings({});
    const g = await getGowaSettings(TENANT);
    expect(g.url).toBe('http://env-gowa:3000');
    expect(g.basicAuth).toBe('env-gowa-user:env-gowa-pass');
    expect(g.enabled).toBe(true);
  });

  it('honours an explicit disabled flag from the DB', async () => {
    mockDbSettings({ gowa: { enabled: false } });
    const g = await getGowaSettings(TENANT);
    expect(g.enabled).toBe(false);
  });
});

// ── getEmailSettings ─────────────────────────────────────────────────────────

describe('getEmailSettings', () => {
  it('returns settings when host and port are present', async () => {
    mockDbSettings({ email: { host: 'smtp.test', port: 465, secure: true, username: 'u', password: 'p' } });
    const e = await getEmailSettings(TENANT);
    expect(e).toEqual({ host: 'smtp.test', port: 465, secure: true, username: 'u', password: 'p' });
  });

  it('returns null when host is missing', async () => {
    mockDbSettings({ email: { port: 465 } });
    const e = await getEmailSettings(TENANT);
    expect(e).toBeNull();
  });

  it('returns null when port is missing', async () => {
    mockDbSettings({ email: { host: 'smtp.test' } });
    const e = await getEmailSettings(TENANT);
    expect(e).toBeNull();
  });

  it('returns null when email section is absent', async () => {
    mockDbSettings({});
    const e = await getEmailSettings(TENANT);
    expect(e).toBeNull();
  });
});

// ── getAiSettings ────────────────────────────────────────────────────────────

describe('getAiSettings', () => {
  it('returns the ai block from DB', async () => {
    mockDbSettings({ ai: { enabled: true, apiUrl: 'http://ai', apiKey: 'k', model: 'gpt-4' } });
    const a = await getAiSettings(TENANT);
    expect(a).toEqual({ enabled: true, apiUrl: 'http://ai', apiKey: 'k', model: 'gpt-4' });
  });

  it('returns {} when ai section is absent', async () => {
    mockDbSettings({});
    const a = await getAiSettings(TENANT);
    expect(a).toEqual({});
  });
});

// ── getStorageSettings ───────────────────────────────────────────────────────

describe('getStorageSettings', () => {
  it('reads canonical keys from DB', async () => {
    mockDbSettings({
      storage: {
        provider: 's3', bucket: 'my-bucket', region: 'us-east-1',
        accessKey: 'AK', secretKey: 'SK', publicUrl: 'https://cdn.test',
      },
    });
    const s = await getStorageSettings(TENANT);
    expect(s.provider).toBe('s3');
    expect(s.bucket).toBe('my-bucket');
    expect(s.region).toBe('us-east-1');
    expect(s.accessKey).toBe('AK');
    expect(s.secretKey).toBe('SK');
    expect(s.publicUrl).toBe('https://cdn.test');
    expect(s.configured).toBe(true);
  });

  it('falls back to env when DB settings are empty', async () => {
    mockDbSettings({});
    const s = await getStorageSettings(TENANT);
    expect(s.provider).toBe('local');
    expect(s.bucket).toBe('env-bucket');
    expect(s.region).toBe('env-region');
    expect(s.accessKey).toBe('env-ak');
    expect(s.secretKey).toBe('env-sk');
    expect(s.configured).toBe(true);
  });

  it('accepts legacy storageProvider key', async () => {
    mockDbSettings({ storage: { storageProvider: 'firebase' } });
    const s = await getStorageSettings(TENANT);
    expect(s.provider).toBe('firebase');
  });

  it('resolves Firebase fields', async () => {
    mockDbSettings({
      storage: {
        provider: 'firebase',
        firebaseBucket: 'my.appspot.com',
        serviceAccount: '{"type":"service_account","project_id":"demo"}',
      },
    });
    const s = await getStorageSettings(TENANT);
    expect(s.firebaseBucket).toBe('my.appspot.com');
    // serviceAccount should be parsed into an object
    expect(typeof s.serviceAccount).toBe('object');
    expect((s.serviceAccount as any).project_id).toBe('demo');
  });

  it('parses a JSON string serviceAccount', async () => {
    mockDbSettings({
      storage: {
        provider: 'gdrive',
        serviceAccount: '{"type":"service_account","client_email":"x@y.iam"}',
      },
    });
    const s = await getStorageSettings(TENANT);
    expect(typeof s.serviceAccount).toBe('object');
    expect((s.serviceAccount as any).type).toBe('service_account');
  });

  it('leaves a malformed serviceAccount as-is for driver to reject', async () => {
    mockDbSettings({
      storage: {
        provider: 'firebase',
        serviceAccount: 'not valid json',
      },
    });
    const s = await getStorageSettings(TENANT);
    // Not valid JSON → left as string
    expect(typeof s.serviceAccount).toBe('string');
  });

  it('assembles a Google Drive OAuth credential from legacy keys', async () => {
    mockDbSettings({
      storage: {
        provider: 'gdrive',
        gdriveClientId: 'cid',
        gdriveClientSecret: 'csecret',
        gdriveRefreshToken: 'rtoken',
        gdriveFolderId: 'folder-x',
      },
    });
    const s = await getStorageSettings(TENANT);
    expect(s.driveFolderId).toBe('folder-x');
    expect(typeof s.serviceAccount).toBe('object');
    expect((s.serviceAccount as any).type).toBe('authorized_user');
    expect((s.serviceAccount as any).client_id).toBe('cid');
    expect((s.serviceAccount as any).refresh_token).toBe('rtoken');
  });

  it('reads R2 legacy keys as fallbacks', async () => {
    mockDbSettings({
      storage: {
        provider: 'r2',
        r2AccountId: 'acct-legacy',
        r2AccessKeyId: 'r2ak',
        r2SecretAccessKey: 'r2sk',
        r2BucketName: 'r2bucket',
      },
    });
    const s = await getStorageSettings(TENANT);
    expect(s.accountId).toBe('acct-legacy');
    expect(s.accessKey).toBe('r2ak');
    expect(s.secretKey).toBe('r2sk');
    expect(s.bucket).toBe('r2bucket');
  });

  it('configured is false when no keys are present and env is empty', async () => {
    // Override env to be empty for this test
    const envMod = await import('../../config/env.js');
    const origEnv = { ...envMod.env };
    Object.assign(envMod.env, {
      S3_BUCKET: '', S3_REGION: '', S3_ACCESS_KEY: '', S3_SECRET_KEY: '',
    });

    clearTenantSettingsCache();
    mockDbSettings({ storage: { provider: 'local' } });
    const s = await getStorageSettings(TENANT);
    expect(s.configured).toBe(false);

    // Restore
    Object.assign(envMod.env, origEnv);
  });

  it('does NOT mix env fallback when DB has an explicit provider (minio bug)', async () => {
    // Regression: DB sets provider=s3 with real AWS keys but no endpoint.
    // S3_ENDPOINT=http://minio:9000 from docker-compose env was leaking in,
    // causing "getaddrinfo EAI_AGAIN minio" errors.
    clearTenantSettingsCache();
    mockDbSettings({
      storage: {
        provider: 's3',
        bucket: 'prod-bucket',
        region: 'ap-southeast-1',
        accessKey: 'REAL-AK',
        secretKey: 'REAL-SK',
      },
    });
    const s = await getStorageSettings(TENANT);
    // Must use DB values, NOT env fallbacks
    expect(s.bucket).toBe('prod-bucket');
    expect(s.region).toBe('ap-southeast-1');
    expect(s.accessKey).toBe('REAL-AK');
    expect(s.secretKey).toBe('REAL-SK');
    // Crucially: no endpoint (AWS S3 doesn't need one)
    expect(s.endpoint).toBeUndefined();
  });

  it('still uses env fallback when DB has NO provider set', async () => {
    clearTenantSettingsCache();
    mockDbSettings({});
    const s = await getStorageSettings(TENANT);
    // env mock has S3_BUCKET=env-bucket etc.
    expect(s.bucket).toBe('env-bucket');
    expect(s.region).toBe('env-region');
    expect(s.accessKey).toBe('env-ak');
    expect(s.secretKey).toBe('env-sk');
  });
});
