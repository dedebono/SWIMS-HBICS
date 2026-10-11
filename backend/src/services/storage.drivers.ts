/**
 * Storage driver registry.
 *
 * Media used to be implicitly local: `directUploadAsset` called saveLocalFile()
 * and `getAssetObject` called readLocalFile(), unconditionally. An admin could
 * point the settings page at S3 and nothing changed, because the code never
 * consulted the setting.
 *
 * Every backend implements the same three operations (put / get / delete) so the
 * upload and download paths can dispatch on the provider instead of hardcoding
 * one. New uploads honour the tenant's CURRENT setting; reads honour the
 * PER-ASSET `storage_backend`, which is what keeps old files reachable after a
 * provider switch.
 *
 * Drivers are created per call (`createDriver(cfg)`) and hold their own config.
 * A shared module-level client would be wrong: two tenants using different
 * buckets would overwrite each other's credentials between async awaits.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { existsSync } from 'fs';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { ValidationError } from '../utils/errors.js';

export type StorageProvider = 'local' | 's3' | 'r2' | 'firebase' | 'gdrive';

export const STORAGE_PROVIDERS: StorageProvider[] = ['local', 's3', 'r2', 'firebase', 'gdrive'];

/**
 * Resolved on every call rather than captured at import time, so tests (and any
 * future runtime reconfiguration) can point the media directory somewhere else
 * after this module has already been loaded.
 */
function mediaDir(): string {
  return process.env['MEDIA_DIR'] || '/app/media';
}

/**
 * Normalises whatever the settings form / legacy data holds into a known
 * provider id. Unknown or empty input falls back to 'local' so a typo in the
 * form can never make existing files unreadable.
 */
export function normalizeProvider(value: string | undefined | null): StorageProvider {
  const v = String(value ?? '').trim().toLowerCase();
  if ((STORAGE_PROVIDERS as string[]).includes(v)) return v as StorageProvider;
  // Aliases seen in the wild for the same backends. These include the exact
  // strings the settings form has always submitted, so a provider saved before
  // this registry existed still resolves to the right driver.
  if (v === 'cloudflare_r2' || v === 'cloudflare' || v === 'cloudflarer2') return 'r2';
  if (v === 'amazon_s3' || v === 'amazon' || v === 'amazons3' || v === 'aws' || v === 'minio') {
    return 's3';
  }
  if (
    v === 'google_drive' || v === 'googledrive' || v === 'google' ||
    v === 'gcs' || v === 'gdriveapi'
  ) {
    return 'gdrive';
  }
  if (v === 'google_cloud_storage') return 's3';
  return 'local';
}

// ── Config shape ─────────────────────────────────────────────────────────────

export interface StorageConfig {
  provider: StorageProvider;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  /** Cloudflare R2 account id, used to derive the endpoint. */
  accountId?: string;
  /** Firebase: bucket name. */
  firebaseBucket?: string;
  /** Firebase / Google: service-account JSON (parsed object or raw string). */
  serviceAccount?: Record<string, unknown> | string | null;
  /** Google Drive: folder id to upload into. */
  driveFolderId?: string;
  /** Google Drive: shared drive id (optional). */
  driveSharedDriveId?: string;
}

export interface StorageDriver {
  readonly provider: StorageProvider;
  /** Names of the fields still missing before uploads can work. */
  missingConfig(cfg: StorageConfig): string[];
  /**
   * Store `data` and return the key to record as `media_assets.storage_key`.
   *
   * Usually that is the `key` passed in, but Google Drive assigns its own file
   * id and gives no way to choose it — so the returned key differs from the
   * requested one. Callers MUST store the returned value, not the requested
   * key, or Drive assets become unreachable.
   */
  put(key: string, data: Buffer, mimeType: string): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Optional: a URL the browser can PUT to directly, bypassing our backend. */
  presignPut?(key: string, mimeType: string): Promise<string>;
}

// ── Local ────────────────────────────────────────────────────────────────────

const localDriver: StorageDriver = {
  provider: 'local',

  missingConfig() {
    return [];
  },

  async put(key, data) {
    const filePath = join(mediaDir(), key);
    const dir = filePath.slice(0, filePath.lastIndexOf('/'));
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(filePath, data);
    return { key };
  },

  async get(key) {
    return readFile(join(mediaDir(), key));
  },

  async delete(key) {
    const filePath = join(mediaDir(), key);
    // Already-gone is a success: deletion is idempotent.
    if (existsSync(filePath)) await unlink(filePath);
  },
};

// ── S3-compatible (Amazon S3 + Cloudflare R2) ────────────────────────────────
// R2 speaks the S3 API, so both share one client; only the endpoint and signing
// region differ. R2 rejects real regions, hence 'auto' for it.

/**
 * Clients are cached per credential set — signing on every request would
 * otherwise rebuild a client per call. The key includes the provider and
 * endpoint, so R2 and S3 configs can never collide.
 */
const s3Clients = new Map<string, S3Client>();

function r2Endpoint(cfg: StorageConfig): string | undefined {
  if (cfg.endpoint) return cfg.endpoint;
  if (cfg.accountId) return `https://${cfg.accountId}.r2.cloudflarestorage.com`;
  return undefined;
}

function buildS3Client(provider: 's3' | 'r2', cfg: StorageConfig): S3Client {
  const endpoint = provider === 'r2' ? r2Endpoint(cfg) : cfg.endpoint;
  const region = provider === 'r2' ? 'auto' : cfg.region || 'us-east-1';
  const cacheKey = JSON.stringify([provider, endpoint ?? '', region, cfg.accessKey ?? '', cfg.secretKey ?? '']);
  const cached = s3Clients.get(cacheKey);
  if (cached) return cached;

  const client = new S3Client({
    endpoint: endpoint || undefined,
    region,
    credentials: {
      accessKeyId: cfg.accessKey || '',
      secretAccessKey: cfg.secretKey || '',
    },
    // Path-style addressing is only used when a custom endpoint is set (MinIO,
    // LocalStack, etc). AWS S3 prefers virtual-hosted style and will reject
    // path-style for newer buckets.
    forcePathStyle: provider === 's3' && Boolean(endpoint),
  });
  s3Clients.set(cacheKey, client);
  return client;
}

function makeS3Driver(provider: 's3' | 'r2'): (cfg: StorageConfig) => StorageDriver {
  return (cfg) => {
    const config = { ...cfg, provider };
    const client = buildS3Client(provider, config);
    const bucket = () => {
      if (!config.bucket) throw new ValidationError('Bucket belum diisi.');
      return config.bucket;
    };

    return {
      provider,

      missingConfig() {
        const missing: string[] = [];
        if (!config.bucket) missing.push('bucket');
        if (provider === 's3' && !config.region) missing.push('region');
        if (provider === 'r2' && !config.endpoint && !config.accountId) missing.push('accountId');
        if (!config.accessKey) missing.push('accessKey');
        if (!config.secretKey) missing.push('secretKey');
        return missing;
      },

      async put(key, data, mimeType) {
        await client.send(
          new PutObjectCommand({ Bucket: bucket(), Key: key, Body: data, ContentType: mimeType }),
        );
        return { key };
      },

      async get(key) {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
        const bytes = await res.Body?.transformToByteArray();
        if (!bytes) throw new Error(`Empty body returned for ${key}`);
        return Buffer.from(bytes);
      },

      async delete(key) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
      },

      async presignPut(key, mimeType) {
        return getSignedUrl(
          client,
          new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mimeType }),
          { expiresIn: 3600 },
        );
      },
    };
  };
}

// ── Firebase Storage ─────────────────────────────────────────────────────────
// Lazy-loaded: firebase-admin is a heavy module and most tenants will never
// select Firebase, so importing this file must not pay for it.

function parseServiceAccount(raw: StorageConfig['serviceAccount']): Record<string, unknown> {
  if (!raw) throw new ValidationError('serviceAccount Firebase belum diisi.');
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ValidationError('serviceAccount Firebase bukan JSON yang valid.');
  }
}

/** Key under which the initialized app for a given config is cached. */
const firebaseApps = new Map<string, { app: unknown; bucket: FirebaseBucketLike }>();

async function resolveFirebase(cfg: StorageConfig) {
  const bucketName = cfg.firebaseBucket || cfg.bucket;
  if (!bucketName) throw new ValidationError('Bucket Firebase belum diisi.');

  const creds = parseServiceAccount(cfg.serviceAccount);
  const fingerprint = JSON.stringify([bucketName, creds['client_email'] ?? '', creds['private_key'] ?? '']);
  const cached = firebaseApps.get(fingerprint);
  if (cached) return cached;

  const admin = (await import('firebase-admin')) as unknown as {
    apps: unknown[];
    initializeApp: (o: unknown) => unknown;
    credential: { cert: (c: unknown) => unknown };
  };

  // Reuse an existing app when the credentials match, otherwise initialize a
  // fresh one — this lets an admin correct a bad service account without a
  // process restart.
  let app = admin.apps.find(
    (a) => (a as { name?: string }).name === `swims-${fingerprint.length}-${String(creds['client_email'] ?? '')}`,
  );
  if (!app) {
    app = admin.initializeApp({
      credential: admin.credential.cert(creds),
      storageBucket: bucketName,
    });
  }

  const bucket = (app as { storage: (b: string) => FirebaseBucketLike }).storage(bucketName);
  firebaseApps.set(fingerprint, { app, bucket });
  return { app, bucket };
}

interface FirebaseBucketLike {
  file(path: string): {
    save(data: Buffer, opts?: Record<string, unknown>): Promise<unknown>;
    download(): Promise<[Buffer]>;
    delete(opts?: Record<string, unknown>): Promise<unknown>;
  };
}

const firebaseDriver = (cfg: StorageConfig): StorageDriver => ({
  provider: 'firebase',

  missingConfig() {
    const missing: string[] = [];
    if (!cfg.firebaseBucket && !cfg.bucket) missing.push('firebaseBucket');
    if (!cfg.serviceAccount) missing.push('serviceAccount');
    return missing;
  },

  async put(key, data, mimeType) {
    const { bucket } = await resolveFirebase(cfg);
    await bucket.file(key).save(data, { contentType: mimeType, resumable: false });
    return { key };
  },

  async get(key) {
    const { bucket } = await resolveFirebase(cfg);
    const [data] = await bucket.file(key).download();
    return Buffer.from(data);
  },

  async delete(key) {
    const { bucket } = await resolveFirebase(cfg);
    await bucket.file(key).delete({ ignoreNotFound: true });
  },
});

// ── Google Drive ─────────────────────────────────────────────────────────────
// storage_key holds the Drive FILE ID (not a path) for this backend.

interface DriveFilesLike {
  create(args: Record<string, unknown>): Promise<{ data: { id?: string } }>;
  get(args: Record<string, unknown>, opts?: Record<string, unknown>): Promise<{ data: unknown }>;
  delete(args: Record<string, unknown>): Promise<unknown>;
}

const driveClients = new Map<string, DriveFilesLike>();

async function resolveDrive(cfg: StorageConfig): Promise<DriveFilesLike> {
  const creds = parseServiceAccount(cfg.serviceAccount);
  const fingerprint = JSON.stringify([creds['client_email'] ?? '', creds['private_key'] ?? '']);
  const cached = driveClients.get(fingerprint);
  if (cached) return cached;

  const mod = (await import('@googleapis/drive')) as unknown as {
    google: { auth: { GoogleAuth: new (o: unknown) => unknown }; drive: (o: unknown) => { files: DriveFilesLike } };
  };
  const auth = new mod.google.auth.GoogleAuth({
    credentials: creds,
    // drive.file = only files this app created, which is the safe scope for a
    // system that writes uploads and reads back its own media.
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const files = mod.google.drive({ version: 'v3', auth }).files;
  driveClients.set(fingerprint, files);
  return files;
}

const gdriveDriver = (cfg: StorageConfig): StorageDriver => ({
  provider: 'gdrive',

  missingConfig() {
    const missing: string[] = [];
    if (!cfg.serviceAccount) missing.push('serviceAccount');
    return missing;
  },

  async put(key, data, mimeType) {
    const files = await resolveDrive(cfg);
    const metadata: Record<string, unknown> = {
      name: key.split('/').pop() || key,
      mimeType,
    };
    if (cfg.driveFolderId) metadata['parents'] = [cfg.driveFolderId];
    if (cfg.driveSharedDriveId) metadata['driveId'] = cfg.driveSharedDriveId;

    const created = await files.create({
      requestBody: metadata,
      media: { mimeType, body: data },
      fields: 'id',
      supportsAllDrives: true,
    });

    // Drive mints its own id and offers no way to choose it, so the requested
    // `key` is only a display name. Returning the real id here is what makes
    // the asset retrievable later — callers store this as storage_key.
    const assignedId = created.data.id;
    if (!assignedId) {
      throw new ValidationError('Google Drive tidak mengembalikan file id saat upload.');
    }
    return { key: assignedId };
  },

  async get(key) {
    const files = await resolveDrive(cfg);
    const res = await files.get(
      { fileId: key, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(res.data as ArrayBuffer);
  },

  async delete(key) {
    const files = await resolveDrive(cfg);
    try {
      await files.delete({ fileId: key, supportsAllDrives: true });
    } catch {
      // Deletion is best-effort: a missing file is not an error worth failing a
      // user-facing request over.
    }
  },
});

// ── Registry ─────────────────────────────────────────────────────────────────

const FACTORIES: Record<StorageProvider, (cfg: StorageConfig) => StorageDriver> = {
  local: () => localDriver,
  s3: makeS3Driver('s3'),
  r2: makeS3Driver('r2'),
  firebase: firebaseDriver,
  gdrive: gdriveDriver,
};

/** Build a driver bound to `cfg`. Each call is independent — no shared config. */
export function createDriver(cfg: StorageConfig): StorageDriver {
  const provider = normalizeProvider(cfg.provider);
  return FACTORIES[provider]({ ...cfg, provider });
}

/** Build the driver, or throw a message naming the exact missing fields. */
export function getConfiguredDriver(cfg: StorageConfig): StorageDriver {
  const driver = createDriver(cfg);
  const missing = driver.missingConfig(cfg);
  if (missing.length > 0) {
    throw new ValidationError(
      `Penyimpanan "${driver.provider}" belum lengkap. Isian yang kurang: ${missing.join(', ')}. ` +
        `Lengkapi di Pengaturan Sistem → Penyimpanan.`,
    );
  }
  return driver;
}

export function providerLabel(provider: StorageProvider): string {
  switch (provider) {
    case 'local': return 'Lokal (server)';
    case 's3': return 'Amazon S3';
    case 'r2': return 'Cloudflare R2';
    case 'firebase': return 'Firebase Storage';
    case 'gdrive': return 'Google Drive';
    default: return provider;
  }
}