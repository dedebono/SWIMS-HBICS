import { getClientWithTenant } from '../db/pool.js';

/**
 * Single reader for `tenants.settings`.
 *
 * The settings form writes here, and the services that actually USE the config
 * (WAHA, email, storage, AI) read it here. Before this existed, the form saved
 * values that nothing ever looked at — WAHA and S3 were read straight from
 * `env`, so an IT admin could fill the whole page in and change nothing.
 *
 * Every getter falls back to the matching `env.*` value so a tenant that never
 * touched the form keeps working exactly as before.
 */

export interface AiSettings {
  enabled?: boolean;
  provider?: string;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface StorageSettings {
  /** What the form edits. */
  provider?: string;
  /** Legacy key written by older builds — still read, never written now. */
  storageProvider?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  publicUrl?: string;
  /** Cloudflare R2 account id — the endpoint is derived from it. */
  accountId?: string;
  /** Firebase Storage bucket. */
  firebaseBucket?: string;
  /** Service-account JSON, parsed object or raw string. */
  serviceAccount?: Record<string, unknown> | string | null;
  /** Google Drive folder to upload into. */
  driveFolderId?: string;
  /** Google Drive shared drive id (optional). */
  driveSharedDriveId?: string;

  // ── Legacy field names ───────────────────────────────────────────────────
  // The settings form has always used provider-prefixed names. A tenant that
  // filled the form in before the driver registry existed has values under
  // THESE keys, so they are read as fallbacks rather than forcing the admin to
  // re-enter a working configuration.
  firebaseApiKey?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2BucketName?: string;
  gdriveClientId?: string;
  gdriveClientSecret?: string;
  gdriveRefreshToken?: string;
  gdriveFolderId?: string;
  gdriveSharedDriveId?: string;
}

export interface WahaSettings {
  url?: string;
  session?: string;
  apiKey?: string;
}

export interface EmailSettings {
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  from?: string;
}

export interface TenantSettings {
  ai?: AiSettings;
  storage?: StorageSettings;
  waha?: WahaSettings;
  email?: EmailSettings;
  [key: string]: unknown;
}

// ── Short-lived cache ────────────────────────────────────────────────────────
// Settings change rarely but get read on every upload / notification. A 30s TTL
// keeps the DB out of the hot path; `invalidateTenantSettings` forces a re-read
// right after a save so the admin sees their change take effect immediately.

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; settings: TenantSettings }>();

/** Drop a tenant's cached settings — call after every write. */
export function invalidateTenantSettings(tenantId: string): void {
  cache.delete(tenantId);
}

/** Clear every tenant's cache (tests, or a global config reload). */
export function clearTenantSettingsCache(): void {
  cache.clear();
}

export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.settings;

  const client = await getClientWithTenant(tenantId);
  try {
    const { rows } = await client.query('SELECT settings FROM tenants WHERE tenant_id = $1', [tenantId]);
    // pg hands back the jsonb already parsed, but a text column would give a
    // string — handle both so this never silently yields {}.
    const raw = rows[0]?.settings;
    const parsed: TenantSettings =
      typeof raw === 'string' ? (JSON.parse(raw) as TenantSettings) : ((raw ?? {}) as TenantSettings);

    cache.set(tenantId, { at: Date.now(), settings: parsed });
    return parsed;
  } finally {
    client.release();
  }
}

// ── WAHA ─────────────────────────────────────────────────────────────────────

export async function getWahaSettings(tenantId: string): Promise<Required<WahaSettings>> {
  const settings = await getTenantSettings(tenantId);
  const waha = settings.waha ?? {};
  const { env } = await import('../config/env.js');
  return {
    url: waha.url || env.WAHA_URL || 'http://100.127.221.23:3002',
    session: waha.session || 'default',
    apiKey: waha.apiKey || env.WAHA_API_KEY || '',
  };
}

// ── Storage ──────────────────────────────────────────────────────────────────

export interface ResolvedStorage {
  provider: string;
  bucket: string;
  region: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  publicUrl?: string;
  accountId?: string;
  firebaseBucket?: string;
  serviceAccount?: Record<string, unknown> | string | null;
  driveFolderId?: string;
  driveSharedDriveId?: string;
  /** False when nothing usable is configured, so callers can fail loudly. */
  configured: boolean;
}

/**
 * Resolve the tenant's storage settings.
 *
 * Falls back to env.* so a deployment that never opened the settings form keeps
 * working. Note the fallback is S3-shaped (bucket/region/keys); local needs no
 * config at all and is selected explicitly by the form.
 */
export async function getStorageSettings(tenantId: string): Promise<ResolvedStorage> {
  const settings = await getTenantSettings(tenantId);
  const storage = settings.storage ?? {};
  const { env } = await import('../config/env.js');

  const provider = storage.provider || storage.storageProvider || 'local';

  // Canonical names win; the provider-prefixed legacy names are fallbacks so a
  // config saved by the older form keeps working untouched.
  const first = (...values: Array<string | undefined>) =>
    values.find((v) => typeof v === 'string' && v.trim() !== '') ?? '';

  // When the admin has explicitly set a provider in the DB, honour ONLY the DB
  // values — environment variables are a bootstrap fallback for deployments
  // that never opened the settings form. Mixing them causes bugs like using
  // S3_ENDPOINT=http://minio:9000 when the tenant is on real AWS S3.
  const hasDbProvider = Boolean(storage.provider || storage.storageProvider);

  const bucket = first(storage.bucket, storage.r2BucketName, storage.firebaseStorageBucket)
    || (hasDbProvider ? '' : (env.S3_BUCKET || ''));
  const region = first(storage.region)
    || (hasDbProvider ? '' : (env.S3_REGION || ''));
  const accessKey = first(storage.accessKey, storage.r2AccessKeyId, storage.firebaseApiKey)
    || (hasDbProvider ? '' : (env.S3_ACCESS_KEY || ''));
  const secretKey = first(storage.secretKey, storage.r2SecretAccessKey)
    || (hasDbProvider ? '' : (env.S3_SECRET_KEY || ''));

  // A service account may have been saved as a JSON string; hand it to the
  // driver as an object so it does not have to guess which form it is in.
  let serviceAccount: Record<string, unknown> | string | null = storage.serviceAccount ?? null;
  if (typeof serviceAccount === 'string' && serviceAccount.trim().startsWith('{')) {
    try {
      serviceAccount = JSON.parse(serviceAccount) as Record<string, unknown>;
    } catch {
      // Leave it as-is: the driver raises a clear "not valid JSON" error.
    }
  }

  // Google Drive in the legacy form is a raw OAuth client (id + secret +
  // refresh token) rather than a service account. Assemble the shape
  // google-auth-library expects so both styles work.
  if (!serviceAccount && storage.gdriveClientId && storage.gdriveRefreshToken) {
    serviceAccount = {
      type: 'authorized_user',
      client_id: storage.gdriveClientId,
      client_secret: storage.gdriveClientSecret,
      refresh_token: storage.gdriveRefreshToken,
    };
  }

  return {
    provider,
    bucket,
    region,
    endpoint: storage.endpoint || (hasDbProvider ? undefined : (env.S3_ENDPOINT || undefined)),
    accessKey: accessKey || undefined,
    secretKey: secretKey || undefined,
    publicUrl: storage.publicUrl || undefined,
    accountId: first(storage.accountId, storage.r2AccountId) || undefined,
    firebaseBucket:
      first(storage.firebaseBucket, storage.firebaseStorageBucket) || undefined,
    serviceAccount,
    driveFolderId: first(storage.driveFolderId, storage.gdriveFolderId) || undefined,
    driveSharedDriveId: storage.driveSharedDriveId || storage.gdriveSharedDriveId || undefined,
    configured: Boolean(bucket && region && accessKey && secretKey),
  };
}

// ── Email ────────────────────────────────────────────────────────────────────

export async function getEmailSettings(tenantId: string): Promise<{
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
} | null> {
  const settings = await getTenantSettings(tenantId);
  const email = settings.email ?? {};
  if (!email.host || !email.port) return null;
  return {
    host: String(email.host),
    port: Number(email.port),
    secure: Boolean(email.secure),
    username: email.username || undefined,
    password: email.password || undefined,
  };
}

// ── AI ───────────────────────────────────────────────────────────────────────

export async function getAiSettings(tenantId: string): Promise<AiSettings> {
  const settings = await getTenantSettings(tenantId);
  return settings.ai ?? {};
}