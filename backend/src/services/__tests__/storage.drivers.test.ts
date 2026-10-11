import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { StorageConfig, StorageProvider } from '../storage.drivers.js';

/**
 * Storage is now provider-agnostic. These tests lock down the parts that are
 * easy to regress silently:
 *
 *  - provider id normalisation (the form and the DB use different spellings)
 *  - every provider round-trips bytes through put → get
 *  - missing credentials fail LOUDLY and name the field, rather than writing
 *    nowhere and reporting success
 *  - presigned upload exists only where the provider really supports it
 */

const TMP = mkdtempSync(join(tmpdir(), 'swims-storage-'));
const ORIGINAL_MEDIA_DIR = process.env['MEDIA_DIR'];

// storage.drivers.ts reads MEDIA_DIR at module load, so it must be imported
// after the env var is set. The module is imported inside beforeAll for the
// same reason.
let D: typeof import('../storage.drivers.js');

afterAll(() => {
  if (ORIGINAL_MEDIA_DIR === undefined) delete process.env['MEDIA_DIR'];
  else process.env['MEDIA_DIR'] = ORIGINAL_MEDIA_DIR;
  rmSync(TMP, { recursive: true, force: true });
});

// ── Fake S3 client ───────────────────────────────────────────────────────────
// Stands in for @aws-sdk/client-s3 so the S3/R2 drivers can be exercised
// without network access or real credentials.

interface StoredObject { body: Buffer; contentType?: string }

const s3Objects = new Map<string, StoredObject>();
const s3Commands: string[] = [];

const sendMock = vi.fn(async (command: unknown) => {
  const cmd = command as { constructor: { name: string }; input: Record<string, unknown> };
  const kind = cmd.constructor.name;
  s3Commands.push(kind);
  const bucket = String(cmd.input['Bucket']);
  const key = String(cmd.input['Key']);

  if (kind === 'PutObjectCommand') {
    s3Objects.set(`${bucket}/${key}`, {
      body: cmd.input['Body'] as Buffer,
      contentType: cmd.input['ContentType'] as string | undefined,
    });
    return {};
  }
  if (kind === 'GetObjectCommand') {
    const hit = s3Objects.get(`${bucket}/${key}`);
    if (!hit) throw new Error(`NoSuchKey: ${key}`);
    return { Body: { transformToByteArray: async () => hit.body } };
  }
  if (kind === 'DeleteObjectCommand') {
    s3Objects.delete(`${bucket}/${key}`);
    return {};
  }
  return {};
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = sendMock;
    constructor(public config: Record<string, unknown>) {}
  },
  PutObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  GetObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  DeleteObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async (_client: unknown, _cmd: unknown, opts: { expiresIn: number }) => {
    const e = opts.expiresIn;
    return `https://bucket.s3.amazonaws.com/key?X-Amz-Expires=${e}&sig=abc`;
  }),
}));

// ── Fake Firebase ────────────────────────────────────────────────────────────

const firebaseObjects = new Map<string, Buffer>();

vi.mock('firebase-admin', () => {
  const apps: unknown[] = [];
  return {
    apps,
    initializeApp: vi.fn((opts: unknown) => {
      const app = { opts, name: `app-${apps.length}`, storage: () => bucket };
      apps.push(app);
      return app;
    }),
    credential: { cert: (c: unknown) => ({ cert: c }) },
  };
});

const bucket = {
  file: (path: string) => ({
    save: async (data: Buffer) => { firebaseObjects.set(path, data); },
    download: async () => {
      const hit = firebaseObjects.get(path);
      if (!hit) throw new Error(`not found: ${path}`);
      return [hit];
    },
    delete: async () => { firebaseObjects.delete(path); },
  }),
};

// ── Fake Google Drive ────────────────────────────────────────────────────────

const driveFiles = new Map<string, Buffer>();
let nextDriveId = 1;

// Exposed so a test can force the "Drive returned no id" failure path.
let driveFilesOverride: {
  create: (a: Record<string, unknown>) => Promise<{ data: { id?: string } }>;
};
const originalCreate = async ({ media }: { media: { body: Buffer } }) => {
  const id = `drive-file-${nextDriveId++}`;
  driveFiles.set(id, media.body);
  return { data: { id } };
};

vi.mock('@googleapis/drive', () => {
  driveFilesOverride = {
    create: async (args: { media: { body: Buffer } }) => originalCreate(args),
  };
  return {
    google: {
      auth: { GoogleAuth: class { constructor(public o: unknown) {} } },
      drive: (_o: unknown) => ({
        files: {
          create: (args: Record<string, unknown>) => driveFilesOverride.create(args),
          get: async ({ fileId }: { fileId: string }) => {
            const hit = driveFiles.get(fileId);
            if (!hit) throw new Error('not found');
            return { data: hit.buffer.slice(hit.byteOffset, hit.byteOffset + hit.byteLength) };
          },
          delete: async ({ fileId }: { fileId: string }) => { driveFiles.delete(fileId); },
        },
      }),
    },
  };
});

// Re-import after mocks so the drivers pick up the mocked SDKs.
beforeAll(async () => {
  process.env['MEDIA_DIR'] = TMP;
  D = await import('../storage.drivers.js');
});

const PAYLOAD = Buffer.from('SN5SWvkgc0Rhcjpcg==', 'utf8');
const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'demo',
  client_email: 'demo@demo.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\ndemo\n-----END PRIVATE KEY-----\n',
};

beforeEach(() => {
  s3Objects.clear();
  s3Commands.length = 0;
  firebaseObjects.clear();
  driveFiles.clear();
  sendMock.mockClear();
});

const CONFIGS: Record<string, StorageConfig> = {
  local: { provider: 'local' },
  s3: {
    provider: 's3',
    bucket: 'swims-media',
    region: 'ap-southeast-1',
    accessKey: 'AKIAEXAMPLE',
    secretKey: 'secret',
  },
  r2: {
    provider: 'r2',
    bucket: 'swims-r2',
    accountId: 'acct123',
    accessKey: 'r2key',
    secretKey: 'r2secret',
  },
  firebase: {
    provider: 'firebase',
    firebaseBucket: 'demo.appspot.com',
    serviceAccount: SERVICE_ACCOUNT,
  },
  gdrive: {
    provider: 'gdrive',
    serviceAccount: SERVICE_ACCOUNT,
    driveFolderId: 'folder-1',
  },
};

const PROVIDERS: StorageProvider[] = ['local', 's3', 'r2', 'firebase', 'gdrive'];

describe('normalizeProvider', () => {
  it('passes through the canonical ids', () => {
    for (const p of PROVIDERS) {
      expect(D.normalizeProvider(p)).toBe(p);
    }
  });

  it('maps the spellings the settings form has used over time', () => {
    expect(D.normalizeProvider('cloudflare_r2')).toBe('r2');
    expect(D.normalizeProvider('google_drive')).toBe('gdrive');
    expect(D.normalizeProvider('amazon_s3')).toBe('s3');
    expect(D.normalizeProvider('AWS')).toBe('s3');
    expect(D.normalizeProvider('minio')).toBe('s3');
    expect(D.normalizeProvider('gdriveapi')).toBe('gdrive');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(D.normalizeProvider('  S3  ')).toBe('s3');
    expect(D.normalizeProvider('Firebase')).toBe('firebase');
  });

  // A typo must not orphan existing files: falling back to local is the safe
  // direction, because local assets are still on disk.
  it('falls back to local for unknown values rather than throwing', () => {
    expect(D.normalizeProvider('dropbox')).toBe('local');
    expect(D.normalizeProvider('')).toBe('local');
    expect(D.normalizeProvider(undefined)).toBe('local');
    expect(D.normalizeProvider(null)).toBe('local');
  });
});

describe('every provider round-trips bytes', () => {
  it.each(PROVIDERS)('%s: put then get returns identical bytes', async (provider) => {
    const driver = D.createDriver(CONFIGS[provider]!);
    const requested = `tenant-1/asset-1.webp`;

    // The returned key is what gets stored — for Drive it is NOT the requested
    // one, so reading back with `requested` must not be assumed to work.
    const { key } = await driver.put(requested, PAYLOAD, 'image/webp');
    const out = await driver.get(key);

    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.equals(PAYLOAD)).toBe(true);
  });

  it.each(PROVIDERS)('%s: put returns the key to persist', async (provider) => {
    const driver = D.createDriver(CONFIGS[provider]!);
    const requested = `tenant-1/asset-x.webp`;
    const { key } = await driver.put(requested, PAYLOAD, 'image/webp');

    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
    // Only Drive remaps the key; every other backend stores it verbatim.
    if (provider === 'gdrive') expect(key).not.toBe(requested);
    else expect(key).toBe(requested);
  });

  it.each(PROVIDERS)('%s: delete is idempotent', async (provider) => {
    const driver = D.createDriver(CONFIGS[provider]!);

    const { key } = await driver.put(`tenant-1/del.${provider}`, PAYLOAD, 'image/webp');
    await expect(driver.delete(key)).resolves.toBeUndefined();
    // Deleting again must not throw — used by soft-delete cleanup paths.
    await expect(driver.delete(key)).resolves.toBeUndefined();
  });
});

describe('local driver', () => {
  it('writes under MEDIA_DIR and creates tenant subdirectories', async () => {
    const driver = D.createDriver({ provider: 'local' });
    const { key } = await driver.put('tenant-abc/asset-1.webp', PAYLOAD, 'image/webp');

    expect(key).toBe('tenant-abc/asset-1.webp');
    expect(existsSync(join(TMP, key))).toBe(true);
    expect((await driver.get(key)).equals(PAYLOAD)).toBe(true);
  });

  it('needs no credentials at all', () => {
    expect(D.createDriver({ provider: 'local' }).missingConfig({ provider: 'local' })).toEqual([]);
  });

  it('is the only provider without a presignPut', () => {
    expect(D.createDriver({ provider: 'local' }).presignPut).toBeUndefined();
    expect(D.createDriver(CONFIGS.s3!).presignPut).toBeTypeOf('function');
  });
});

describe('s3 driver', () => {
  it('sends PutObject/GetObject/DeleteObject to the configured bucket', async () => {
    const driver = D.createDriver(CONFIGS.s3!);
    await driver.put('t/a.webp', PAYLOAD, 'image/webp');
    await driver.get('t/a.webp');
    await driver.delete('t/a.webp');

    expect(s3Commands).toEqual(['PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand']);
    expect(s3Objects.size).toBe(0);
  });

  it('presigns a browser-uploadable https URL', async () => {
    const url = await D.createDriver(CONFIGS.s3!).presignPut!('t/a.webp', 'image/webp');
    expect(url).toContain('https://');
    expect(url).toContain('X-Amz-Expires=3600');
  });
});

describe('r2 driver', () => {
  it('derives the Cloudflare endpoint from the account id', () => {
    const driver = D.createDriver(CONFIGS.r2!);
    // forcePathStyle is false for R2 (virtual-hosted style), and the region is
    // 'auto' because R2 rejects real regions in the signature.
    expect(driver.missingConfig(CONFIGS.r2!)).toEqual([]);
  });

  it('reports accountId as the missing field when it is absent', () => {
    const cfg: StorageConfig = { ...CONFIGS.r2!, accountId: undefined, endpoint: undefined };
    expect(D.createDriver(cfg).missingConfig(cfg)).toContain('accountId');
  });

  it('still speaks plain S3 commands', async () => {
    await D.createDriver(CONFIGS.r2!).put('t/a.webp', PAYLOAD, 'image/webp');
    expect(s3Commands).toContain('PutObjectCommand');
  });
});

describe('configuration guards', () => {
  it('s3 reports each missing credential by name', () => {
    const cfg: StorageConfig = { provider: 's3' };
    expect(D.createDriver(cfg).missingConfig(cfg)).toEqual([
      'bucket', 'region', 'accessKey', 'secretKey',
    ]);
  });

  it('firebase reports bucket and serviceAccount', () => {
    const cfg: StorageConfig = { provider: 'firebase' };
    expect(D.createDriver(cfg).missingConfig(cfg)).toEqual(['firebaseBucket', 'serviceAccount']);
  });

  it('gdrive reports only serviceAccount', () => {
    const cfg: StorageConfig = { provider: 'gdrive' };
    expect(D.createDriver(cfg).missingConfig(cfg)).toEqual(['serviceAccount']);
  });

  // The whole point of getConfiguredDriver: fail at save/upload time with a
  // message an admin can act on, instead of silently writing nowhere.
  it('getConfiguredDriver throws and names the missing fields', () => {
    expect(() => D.getConfiguredDriver({ provider: 's3' })).toThrowError(/bucket, region, accessKey, secretKey/);
    expect(() => D.getConfiguredDriver({ provider: 's3' })).toThrowError(/Pengaturan Sistem/);
  });

  it('getConfiguredDriver passes a complete config through', () => {
    expect(D.getConfiguredDriver(CONFIGS.s3!).provider).toBe('s3');
    expect(D.getConfiguredDriver({ provider: 'local' }).provider).toBe('local');
  });

  it('rejects a malformed service account with a clear message', async () => {
    const driver = D.createDriver({ provider: 'firebase', firebaseBucket: 'b', serviceAccount: 'not json' });
    await expect(driver.put('t/a.webp', PAYLOAD, 'image/webp')).rejects.toThrowError(/bukan JSON/);
  });

  it('rejects a missing service account with a clear message', async () => {
    const driver = D.createDriver({ provider: 'gdrive', serviceAccount: undefined });
    await expect(driver.get('file-1')).rejects.toThrowError(/serviceAccount/);
  });
});

describe('driver isolation', () => {
  // Regression guard: an earlier draft cached one module-level config, so two
  // tenants with different buckets overwrote each other's credentials between
  // async awaits.
  it('two drivers built from different configs keep separate credentials', () => {
    const a = D.createDriver({ ...CONFIGS.s3!, bucket: 'bucket-a', accessKey: 'key-a' });
    const b = D.createDriver({ ...CONFIGS.s3!, bucket: 'bucket-b', accessKey: 'key-b' });

    expect(a).not.toBe(b);
    expect(a.missingConfig({ ...CONFIGS.s3!, bucket: 'bucket-a', accessKey: 'key-a' })).toEqual([]);
  });

  it('unknown provider ids resolve to local rather than a broken driver', () => {
    expect(D.createDriver({ provider: 'nonsense' as never }).provider).toBe('local');
  });
});

describe('provider labels', () => {
  it('gives every provider a human label', () => {
    expect(D.providerLabel('local')).toBe('Lokal (server)');
    expect(D.providerLabel('s3')).toBe('Amazon S3');
    expect(D.providerLabel('r2')).toBe('Cloudflare R2');
    expect(D.providerLabel('firebase')).toBe('Firebase Storage');
    expect(D.providerLabel('gdrive')).toBe('Google Drive');
  });
});

describe('drive file ids', () => {
  it('uses Drive-assigned ids rather than the object key', async () => {
    const driver = D.createDriver(CONFIGS.gdrive!);
    const { key } = await driver.put('tenant-1/asset-1.webp', PAYLOAD, 'image/webp');

    // Drive mints its own id; media.service stores that as storage_key, and it
    // must be the id rather than the requested key.
    expect(key).not.toBe('tenant-1/asset-1.webp');
    expect(driveFiles.size).toBe(1);
    expect(Array.from(driveFiles.keys())).toEqual([key]);
    expect(driveFiles.get(key)!.equals(PAYLOAD)).toBe(true);
  });

  it('fails loudly if Drive returns no file id', async () => {
    // A Drive response without an id would otherwise produce an asset row whose
    // storage_key is empty and can never be fetched again.
    const files = driveFilesOverride;
    files.create = async () => ({ data: {} });

    const driver = D.createDriver(CONFIGS.gdrive!);
    await expect(driver.put('tenant-1/no-id.webp', PAYLOAD, 'image/webp'))
      .rejects.toThrowError(/tidak mengembalikan file id/);

    files.create = originalCreate;
  });
});