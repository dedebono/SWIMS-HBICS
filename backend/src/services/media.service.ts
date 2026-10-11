import { createHmac, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { getStorageSettings } from './tenant-settings.service.js';
import {
  createDriver,
  getConfiguredDriver,
  normalizeProvider,
  type StorageConfig,
  type StorageProvider,
} from './storage.drivers.js';
import type { MediaAssetRow } from '@swims/shared';
import type { Request } from 'express';

// Lazy-load sharp only when needed (avoids build errors if not installed)
let sharp: any = null;
async function getSharp() {
  if (!sharp) {
    sharp = (await import('sharp')).default;
  }
  return sharp;
}

/** Read lazily so tests can redirect the media directory at runtime. */
const mediaDir = () => process.env['MEDIA_DIR'] || '/app/media';
const DOWNLOAD_TOKEN_TTL=60 * 60; // 1 hour

// ─── Object keys ─────────────────────────────────────────────────────────────
// Key layout is identical across providers (tenant/assetId.ext) so switching
// storage later doesn't need a key migration. Google Drive is the exception:
// it assigns its own file id, and that id becomes the storage_key.

function buildStorageKey(tenantId: string, assetId: string, fileName: string): string {
  const ext = fileName.split('.').pop() || 'bin';
  return `${tenantId}/${assetId}.${ext}`;
}

/** Resolve the tenant's configured storage into a driver-ready config. */
async function resolveStorageConfig(tenantId: string): Promise<{
  cfg: StorageConfig;
  provider: StorageProvider;
}> {
  const storage = await getStorageSettings(tenantId);
  const provider = normalizeProvider(storage.provider);
  return {
    provider,
    cfg: {
      provider,
      bucket: storage.bucket,
      region: storage.region,
      endpoint: storage.endpoint,
      accessKey: storage.accessKey,
      secretKey: storage.secretKey,
      accountId: storage.accountId,
      firebaseBucket: storage.firebaseBucket,
      serviceAccount: storage.serviceAccount,
      driveFolderId: storage.driveFolderId,
      driveSharedDriveId: storage.driveSharedDriveId,
    },
  };
}

// ─── Local Storage Helpers ───────────────────────────────────────────────────
// Kept for direct/local reads. Remote backends go through the driver registry.

async function ensureLocalDir(tenantId: string): Promise<string> {
  const dir = join(mediaDir(), tenantId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

async function saveLocalFile(tenantId: string, assetId: string, fileName: string, data: Buffer): Promise<string> {
  const dir = await ensureLocalDir(tenantId);
  const storageKey = buildStorageKey(tenantId, assetId, fileName);
  const filePath = join(mediaDir(), storageKey);
  await writeFile(filePath, data);
  return storageKey;
}

async function readLocalFile(storageKey: string): Promise<{ data: Buffer; ext: string }> {
  const filePath = join(mediaDir(), storageKey);
  const data = await readFile(filePath);
  const ext = storageKey.split('.').pop() || '';
  return { data, ext };
}

// ─── WebP Conversion ─────────────────────────────────────────────────────────

async function convertToWebp(inputBuffer: Buffer, mimeType: string): Promise<Buffer> {
  try {
    const s = await getSharp();
    let pipeline = s(inputBuffer);
    if (mimeType === 'image/gif') {
      pipeline = pipeline.gif();
    } else {
      pipeline = pipeline.rotate(); // auto-rotate based on EXIF
    }
    const webpBuffer = await pipeline.webp({ quality: 85 }).toBuffer();
    return webpBuffer;
  } catch {
    // If conversion fails, return original
    return inputBuffer;
  }
}

// ─── Signed URL for Media Downloads ──────────────────────────────────────────

/**
 * Generate a short-lived signed download token for a media asset.
 * Format: base64(urlsafe(JSON)) — contains userId, assetId, expiry, hmac
 */
export function generateDownloadToken(userId: string, assetId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_TTL;
  const payload = `${userId}:${assetId}:${expiry}`;
  const hmac = createHmac('sha256', env.JWT_SECRET)
    .update(payload)
    .digest('base64url');
  const token = Buffer.from(JSON.stringify({ userId, assetId, expiry, hmac })).toString('base64url');
  return token;
}

/**
 * Validate a download token. Returns userId if valid, throws if invalid/expired.
 */
export function validateDownloadToken(token: string): string {
  let parsed: { userId: string; assetId: string; expiry: number; hmac: string };
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString());
  } catch {
    throw new UnauthorizedError('Invalid download token');
  }

  const { userId, assetId, expiry, hmac } = parsed;
  const now = Math.floor(Date.now() / 1000);
  if (now > expiry) {
    throw new UnauthorizedError('Download token expired');
  }

  // Verify HMAC
  const payload = `${userId}:${assetId}:${expiry}`;
  const expectedHmac = createHmac('sha256', env.JWT_SECRET)
    .update(payload)
    .digest('base64url');
  if (hmac !== expectedHmac) {
    throw new UnauthorizedError('Invalid download token signature');
  }

  return userId;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadRequestInput {
  file_name: string;
  mime_type: string;
  file_hash: string;
}

export interface DirectUploadInput {
  file_name: string;
  mime_type: string;
  file_data: string; // base64 encoded
}

export interface LinkAssetInput {
  case_id?: string;
  incident_id?: string;
}

// ─── Direct Upload with WebP Conversion ───────────────────────────────────────
// Backend receives file as base64, converts to WebP, then writes through the
// tenant's configured storage driver.
//
// The provider is chosen per upload and recorded on the asset row, so switching
// providers later affects only FUTURE uploads — everything already uploaded
// stays readable from wherever it actually lives.
export async function directUploadAsset(
  tenantId: string,
  input: DirectUploadInput,
  actorId: string,
  req?: Request,
): Promise<MediaAssetRow> {
  const assetId = uuidv4();
  let fileBuffer = Buffer.from(input.file_data, 'base64');

  // Auto-convert to WebP for images
  let storedMime = input.mime_type;
  if (input.mime_type.startsWith('image/') && input.mime_type !== 'image/webp') {
    // convertToWebp returns the original buffer on failure, so its type is
    // Buffer<ArrayBufferLike>; widen once here rather than at every use.
    fileBuffer = Buffer.from(await convertToWebp(fileBuffer, input.mime_type));
    storedMime = 'image/webp';
  }

  const webpFileName =
    storedMime === 'image/webp' ? input.file_name.replace(/\.[^.]+$/, '.webp') : input.file_name;

  const { cfg, provider } = await resolveStorageConfig(tenantId);
  const requestedKey = buildStorageKey(tenantId, assetId, webpFileName);

  const driver = provider === 'local' ? createDriver(cfg) : getConfiguredDriver(cfg);
  // Google Drive assigns its own file id, so store what the driver actually
  // used rather than the key we asked for.
  const { key: storageKey } = await driver.put(requestedKey, fileBuffer, storedMime);

  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `INSERT INTO media_assets
       (asset_id, tenant_id, uploader_id, file_name, file_hash, mime_type, storage_key, storage_backend, redaction_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'NONE')
     RETURNING *`,
    [
      assetId,
      tenantId,
      actorId,
      webpFileName,
      `size:${fileBuffer.length}`,
      storedMime,
      storageKey,
      provider,
    ],
  );

  const asset = rows[0]!;

  await auditLog({
    action: 'MEDIA_ASSET_CREATED',
    entityType: 'media_assets',
    entityId: asset.asset_id,
    after: asset as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return asset;
}

// ─── Presigned Upload URL (S3-compatible only) ──────────────────────────────
export async function createPresignedUpload(
  tenantId: string,
  input: UploadRequestInput,
  actorId: string,
  req?: Request,
): Promise<{ uploadUrl: string; asset: MediaAssetRow }> {
  const assetId = uuidv4();
  const fileExtension = input.file_name.split('.').pop() || 'bin';
  const storageKey = buildStorageKey(tenantId, assetId, input.file_name);

  const { cfg, provider } = await resolveStorageConfig(tenantId);

  // Direct-to-browser PUT is only possible where the provider speaks signed
  // URLs. Firebase/Drive have no equivalent, so tell the client to fall back
  // to /direct-upload rather than handing back a URL that cannot work.
  if (provider !== 's3' && provider !== 'r2') {
    throw new ValidationError(
      `Penyimpanan "${provider}" tidak mendukung upload langsung dari browser. ` +
        `Gunakan /api/media/direct-upload sebagai gantinya.`,
    );
  }

  const driver = getConfiguredDriver(cfg);
  if (!driver.presignPut) {
    throw new ValidationError(`Penyimpanan "${provider}" tidak mendukung presigned upload.`);
  }

  let uploadUrl = await driver.presignPut(storageKey, input.mime_type);
  // Replace http:// with https:// to avoid Mixed Content when browser uploads
  uploadUrl = uploadUrl.replace('http://', 'https://');

  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `INSERT INTO media_assets
       (asset_id, tenant_id, uploader_id, file_name, file_hash, mime_type, storage_key, storage_backend)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      assetId,
      tenantId,
      actorId,
      input.file_name,
      input.file_hash,
      input.mime_type,
      storageKey,
      provider,
    ],
  );

  const asset = rows[0]!;

  await auditLog({
    action: 'MEDIA_ASSET_CREATED',
    entityType: 'media_assets',
    entityId: asset.asset_id,
    after: asset as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return { uploadUrl, asset };
}

// ─── Link Asset ─────────────────────────────────────────────────────────────
export async function linkAsset(
  tenantId: string,
  assetId: string,
  input: LinkAssetInput,
  actorId: string,
  req?: Request,
): Promise<MediaAssetRow> {
  const { rows: existingRows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `SELECT * FROM media_assets WHERE asset_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [assetId, tenantId]
  );

  if (existingRows.length === 0) {
    throw new NotFoundError('MediaAsset', assetId);
  }

  const before = existingRows[0]!;

  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `UPDATE media_assets
     SET case_id = COALESCE($1, case_id), incident_id = COALESCE($2, incident_id)
     WHERE asset_id = $3 AND tenant_id = $4
     RETURNING *`,
    [input.case_id ?? null, input.incident_id ?? null, assetId, tenantId]
  );

  const updated = rows[0]!;

  await auditLog({
    action: 'MEDIA_ASSET_LINKED',
    entityType: 'media_assets',
    entityId: assetId,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return updated;
}

// ─── Trigger Redaction ───────────────────────────────────────────────────────
export async function triggerRedaction(
  tenantId: string,
  assetId: string,
  actorId: string,
  req?: Request,
): Promise<MediaAssetRow> {
  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `UPDATE media_assets SET redaction_status = 'PENDING', updated_at = now()
     WHERE asset_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [assetId, tenantId]
  );

  if (rows.length === 0) {
    throw new NotFoundError('MediaAsset', assetId);
  }

  const updated = rows[0]!;

  await auditLog({
    action: 'MEDIA_REDACTION_TRIGGERED',
    entityType: 'media_assets',
    entityId: assetId,
    after: updated as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return updated;
}

// ─── Get Metadata & Signed Download URL ─────────────────────────────────────
export async function getAssetDownloadUrl(
  tenantId: string,
  assetId: string,
  actorId: string,
  req?: Request,
): Promise<{ url: string; asset: MediaAssetRow }> {
  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<MediaAssetRow>(
      `SELECT * FROM media_assets WHERE asset_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [assetId, tenantId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('MediaAsset', assetId);
    }
    const asset = rows[0]!;

    // Generate a signed token that embeds userId + assetId (HMAC-protected, time-limited)
    const token = generateDownloadToken(actorId, assetId);
    const url = `/api/media/${assetId}/download?token=${token}`;

    const accessLogEntry = {
      accessed_at: new Date().toISOString(),
      actor_id: actorId,
      ip: req?.ip,
    };

    await client.query(
      `UPDATE media_assets
       SET access_logs = access_logs || $1::jsonb
       WHERE asset_id = $2 AND tenant_id = $3`,
      [JSON.stringify([accessLogEntry]), assetId, tenantId]
    );

    await client.query('COMMIT');
    return { url, asset };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Get Object (dispatches on the asset's OWN backend) ─────────────────────
// Backward compatibility hinges on this function.
//
// It reads `storage_backend` from the asset ROW, not from the tenant's current
// setting. Every asset uploaded before this feature existed is on local disk,
// so switching the tenant to S3 must not make those files unreadable — and an
// asset uploaded after the switch must still be fetched from S3 even if the
// admin later switches back to local.
export async function getAssetObject(
  tenantId: string,
  assetId: string,
): Promise<{ Body: Buffer; ContentType: string; file_name: string }> {
  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `SELECT * FROM media_assets WHERE asset_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [assetId, tenantId],
  );

  if (rows.length === 0) {
    throw new NotFoundError('MediaAsset', assetId);
  }

  const asset = rows[0]!;
  // Rows predating migration 051 read back as NULL; they are all local.
  const backend = normalizeProvider((asset as { storage_backend?: string }).storage_backend || 'local');

  // Local never needs credentials, so an asset saved locally stays readable
  // even after the tenant switches to a provider it hasn't configured yet.
  if (backend === 'local') {
    const { data } = await readLocalFile(asset.storage_key);
    return { Body: data, ContentType: asset.mime_type, file_name: asset.file_name };
  }

  const { cfg } = await resolveStorageConfig(tenantId);
  const driver = createDriver({ ...cfg, provider: backend });
  const data = await driver.get(asset.storage_key);

  return {
    Body: data,
    ContentType: asset.mime_type,
    file_name: asset.file_name,
  };
}

// ─── Delete Object (same per-asset dispatch) ─────────────────────────────────
export async function deleteAssetObject(tenantId: string, assetId: string): Promise<void> {
  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `SELECT storage_key, storage_backend FROM media_assets
     WHERE asset_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [assetId, tenantId],
  );
  if (rows.length === 0) return;

  const row = rows[0] as unknown as { storage_key: string; storage_backend?: string };
  const backend = normalizeProvider(row.storage_backend || 'local');
  if (backend === 'local') {
    await createDriver({ provider: 'local' }).delete(row.storage_key);
    return;
  }

  const { cfg } = await resolveStorageConfig(tenantId);
  await createDriver({ ...cfg, provider: backend }).delete(row.storage_key);
}

// ─── List Assets for Case ─────────────────────────────────────────────────────
export async function listAssetsForCase(
  tenantId: string,
  caseId: string,
  actorId: string,
): Promise<Array<MediaAssetRow & { url: string }>> {
  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `SELECT * FROM media_assets
     WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [caseId, tenantId]
  );

  // Return assets with pre-signed download URLs
  return Promise.all(
    rows.map(async (asset) => {
      const token = generateDownloadToken(actorId, asset.asset_id);
      return { ...asset, url: `/api/media/${asset.asset_id}/download?token=${token}` };
    })
  );
}
