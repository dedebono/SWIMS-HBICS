import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Local media is read straight off disk (deliberately — see readLocalFile), so
// these tests need a real directory rather than an in-memory stub.
const TMP = mkdtempSync(join(tmpdir(), 'swims-media-provider-'));
const ORIGINAL_MEDIA_DIR = process.env['MEDIA_DIR'];
process.env['MEDIA_DIR'] = TMP;

afterAll(() => {
  if (ORIGINAL_MEDIA_DIR === undefined) delete process.env['MEDIA_DIR'];
  else process.env['MEDIA_DIR'] = ORIGINAL_MEDIA_DIR;
  rmSync(TMP, { recursive: true, force: true });
});

function writeLocalFile(key: string, data: Buffer): void {
  const full = join(TMP, key);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, data);
}

vi.mock('../../db/pool.js', () => ({
  queryWithTenant: vi.fn(),
  getClientWithTenant: vi.fn(),
}));

vi.mock('../../utils/audit-log.js', () => ({
  auditLog: vi.fn(async () => undefined),
}));

vi.mock('../../config/env.js', () => ({
  env: { JWT_SECRET: 'test-secret' },
}));

// The global test setup replaces media.service wholesale with vi.fn() stubs, so
// the real implementations are re-imported here. These tests are about the real
// dispatch logic, so the stubbed module must not be what runs.
vi.mock('../media.service.js', async (importOriginal) => await importOriginal());

// The provider registry is stubbed so these tests exercise the DISPATCH logic in
// media.service — "which backend does this asset read from?" — without needing
// real S3/Firebase/Drive credentials. Driver behaviour is covered separately in
// storage.drivers.test.ts.
const putCalls: Array<{ provider: string; key: string; bytes: Buffer }> = [];
const getCalls: Array<{ provider: string; key: string }> = [];
const STORE = new Map<string, Buffer>();

vi.mock('../storage.drivers.js', async (importOriginal) => {
  // Only the REMOTE drivers are stubbed. Local must stay real: media.service
  // reads local assets straight off disk, so a stubbed local driver would make
  // the file appear to vanish between upload and download.
  const actual = await importOriginal<typeof import('../storage.drivers.js')>();
  const remote = (cfg: { provider: string }) => ({
    provider: cfg.provider,
    missingConfig: () => [],
    put: async (key: string, data: Buffer) => {
      putCalls.push({ provider: cfg.provider, key, bytes: data });
      STORE.set(`${cfg.provider}/${key}`, data);
      return { key };
    },
    get: async (key: string) => {
      getCalls.push({ provider: cfg.provider, key });
      const hit = STORE.get(`${cfg.provider}/${key}`);
      if (!hit) throw new Error(`NoSuchKey ${cfg.provider}/${key}`);
      return hit;
    },
    delete: async (key: string) => { STORE.delete(`${cfg.provider}/${key}`); },
  });

  return {
    ...actual,
    createDriver: (cfg: { provider: string }) =>
      cfg.provider === 'local'
        ? actual.createDriver(cfg as Parameters<typeof actual.createDriver>[0])
        : remote(cfg),
    getConfiguredDriver: (cfg: { provider: string }) =>
      cfg.provider === 'local'
        ? actual.getConfiguredDriver(cfg as Parameters<typeof actual.getConfiguredDriver>[0])
        : remote(cfg),
  };
});

import { getClientWithTenant, queryWithTenant } from '../../db/pool.js';
import { getStorageSettings, clearTenantSettingsCache } from '../tenant-settings.service.js';
import * as mediaService from '../media.service.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

const PAYLOAD = Buffer.from('hello-storage', 'utf8');

/** Rows the mocked DB returns for media_assets lookups. */
let assetRows: Array<Record<string, unknown>> = [];
let insertedParams: unknown[] = [];

function mockDb() {
  vi.mocked(queryWithTenant).mockImplementation((async (_t: string, sql: string, args: unknown[] = []) => {
    if (/^\s*INSERT INTO media_assets/i.test(sql)) {
      insertedParams = args;
      const row = {
        asset_id: args[0],
        tenant_id: args[1],
        uploader_id: args[2],
        file_name: args[3],
        file_hash: args[4],
        mime_type: args[5],
        storage_key: args[6],
        storage_backend: args[7],
        deleted_at: null,
      };
      return { rows: [row], rowCount: 1 };
    }
    if (/SELECT/i.test(sql)) return { rows: assetRows, rowCount: assetRows.length };
    return { rows: [], rowCount: 0 };
  }) as never);
}

/** Point the tenant's saved storage settings at `provider`. */
function setSettings(provider: string, extra: Record<string, unknown> = {}) {
  vi.mocked(getClientWithTenant).mockImplementation((async () => {
    return {
      query: async (sql: string) => {
        if (/SELECT settings FROM tenants/i.test(sql)) {
          return { rows: [{ settings: { storage: { provider, ...extra } } }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    };
  }) as never);
  clearTenantSettingsCache();
}

beforeEach(() => {
  putCalls.length = 0;
  getCalls.length = 0;
  insertedParams = [];
  assetRows = [];
  STORE.clear();
  clearTenantSettingsCache();
  mockDb();
});

/**
 * The requirement that makes this feature safe: switching the provider must not
 * orphan files uploaded earlier. These tests are the regression guard for that.
 */
describe('provider switch — existing files stay readable', () => {
  it('an asset uploaded while on local is still read from local after switching to S3', async () => {
    setSettings('local');
    const uploaded = await mediaService.directUploadAsset(
      TENANT, { file_name: 'foto.png', mime_type: 'image/png', file_data: PAYLOAD.toString('base64') }, USER,
    );
    expect(uploaded.storage_backend).toBe('local');
    expect(existsSync(join(TMP, uploaded.storage_key))).toBe(true);

    // Admin switches the tenant to S3.
    setSettings('s3', { bucket: 'b', region: 'r', accessKey: 'a', secretKey: 's' });

    assetRows = [{ ...uploaded }];
    const out = await mediaService.getAssetObject(TENANT, uploaded.asset_id);

    // No S3 lookup happened — it was served from disk.
    expect(getCalls).toEqual([]);
    expect(out.Body.equals(PAYLOAD)).toBe(true);
  });

  it('an asset uploaded to S3 is still read from S3 after switching back to local', async () => {
    setSettings('s3', { bucket: 'b', region: 'r', accessKey: 'a', secretKey: 's' });
    const uploaded = await mediaService.directUploadAsset(
      TENANT, { file_name: 'dok.pdf', mime_type: 'application/pdf', file_data: PAYLOAD.toString('base64') }, USER,
    );
    expect(uploaded.storage_backend).toBe('s3');

    setSettings('local');

    assetRows = [{ ...uploaded }];
    const out = await mediaService.getAssetObject(TENANT, uploaded.asset_id);

    expect(getCalls).toEqual([{ provider: 's3', key: uploaded.storage_key }]);
    expect(out.Body.equals(PAYLOAD)).toBe(true);
  });

  it('local assets remain readable even when the tenant never configured a remote provider', async () => {
    setSettings('local');
    const uploaded = await mediaService.directUploadAsset(
      TENANT, { file_name: 'a.txt', mime_type: 'text/plain', file_data: PAYLOAD.toString('base64') }, USER,
    );
    assetRows = [{ ...uploaded }];

    const out = await mediaService.getAssetObject(TENANT, uploaded.asset_id);
    expect(out.Body.equals(PAYLOAD)).toBe(true);
  });
});

describe('legacy rows', () => {
  // Migration 051 backfills 'local', but a row written by an older build (or a
  // NULL sneaking in) must not 500 — it has to be treated as local.
  it('treats a NULL storage_backend as local', async () => {
    setSettings('s3', { bucket: 'b', region: 'r', accessKey: 'a', secretKey: 's' });
    writeLocalFile('legacy/asset.webp', PAYLOAD);

    assetRows = [{
      asset_id: 'asset-legacy', tenant_id: TENANT, uploader_id: USER,
      file_name: 'lama.webp', mime_type: 'image/webp',
      storage_key: 'legacy/asset.webp', storage_backend: null, deleted_at: null,
    }];

    const out = await mediaService.getAssetObject(TENANT, 'asset-legacy');

    // Read from disk, not from S3 — the tenant's current setting is irrelevant.
    expect(existsSync(join(TMP, 'legacy/asset.webp'))).toBe(true);
    expect(out.Body.equals(PAYLOAD)).toBe(true);
  });

  it('treats an unknown storage_backend as local rather than throwing', async () => {
    setSettings('local');
    writeLocalFile('odd/x.webp', PAYLOAD);
    assetRows = [{
      asset_id: 'asset-odd', tenant_id: TENANT, uploader_id: USER,
      file_name: 'x.webp', mime_type: 'image/webp',
      storage_key: 'odd/x.webp', storage_backend: 'some_retired_backend', deleted_at: null,
    }];

    const out = await mediaService.getAssetObject(TENANT, 'asset-odd');
    expect(out.Body.equals(PAYLOAD)).toBe(true);
  });
});

describe('upload routes to the configured provider', () => {
  it('writes to s3 and records the backend on the row', async () => {
    setSettings('s3', { bucket: 'b', region: 'r', accessKey: 'a', secretKey: 's' });
    await mediaService.directUploadAsset(
      TENANT, { file_name: 'x.pdf', mime_type: 'application/pdf', file_data: PAYLOAD.toString('base64') }, USER,
    );

    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.provider).toBe('s3');
    // storage_backend is the 8th INSERT param.
    expect(insertedParams[7]).toBe('s3');
  });

  it('maps cloudflare_r2 (the value the form sends) onto the r2 driver', async () => {
    setSettings('cloudflare_r2', { bucket: 'b', accountId: 'acct', accessKey: 'a', secretKey: 's' });
    await mediaService.directUploadAsset(
      TENANT, { file_name: 'x.png', mime_type: 'image/png', file_data: PAYLOAD.toString('base64') }, USER,
    );

    expect(putCalls[0]!.provider).toBe('r2');
    expect(insertedParams[7]).toBe('r2');
  });

  it('uses local by default when the tenant has never opened the settings page', async () => {
    setSettings('local');
    const asset = await mediaService.directUploadAsset(
      TENANT, { file_name: 'x.txt', mime_type: 'text/plain', file_data: PAYLOAD.toString('base64') }, USER,
    );

    // Local goes through the real driver, so assert on the file on disk rather
    // than on the remote stub's call log.
    expect(insertedParams[7]).toBe('local');
    expect(existsSync(join(TMP, asset.storage_key))).toBe(true);
  });

  it('keeps non-image uploads as their original mime type', async () => {
    setSettings('local');
    const asset = await mediaService.directUploadAsset(
      TENANT, { file_name: 'laporan.pdf', mime_type: 'application/pdf', file_data: PAYLOAD.toString('base64') }, USER,
    );

    expect(asset.mime_type).toBe('application/pdf');
    expect(asset.file_name).toBe('laporan.pdf');
  });

  it('images are still converted to webp', async () => {
    setSettings('local');
    const asset = await mediaService.directUploadAsset(
      TENANT, { file_name: 'foto.jpg', mime_type: 'image/jpeg', file_data: PAYLOAD.toString('base64') }, USER,
    );
    expect(asset.mime_type).toBe('image/webp');
    expect(asset.file_name).toBe('foto.webp');
  });
});

describe('presigned upload', () => {
  it('is rejected for providers that cannot sign a browser PUT', async () => {
    setSettings('firebase', { firebaseBucket: 'b.appspot.com', serviceAccount: '{}' });
    await expect(
      mediaService.createPresignedUpload(TENANT, { file_name: 'a.png', mime_type: 'image/png', file_hash: 'h' }, USER),
    ).rejects.toThrowError(/tidak mendukung upload langsung/);
  });

  it('is rejected for google drive too', async () => {
    setSettings('google_drive', { serviceAccount: '{}' });
    await expect(
      mediaService.createPresignedUpload(TENANT, { file_name: 'a.png', mime_type: 'image/png', file_hash: 'h' }, USER),
    ).rejects.toThrowError(/direct-upload/);
  });
});

describe('download token', () => {
  it('round-trips and rejects tampering', () => {
    const token = mediaService.generateDownloadToken(USER, 'asset-1');
    expect(mediaService.validateDownloadToken(token)).toBe(USER);
    expect(() => mediaService.validateDownloadToken(`${token}x`)).toThrow();
  });
});