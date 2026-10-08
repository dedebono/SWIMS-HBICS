import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { env } from '../config/env.js';
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

const MEDIA_DIR = '/app/media';
const DOWNLOAD_TOKEN_TTL = 60 * 60; // 1 hour

// ─── Local Storage Helpers ─────────────────────────────────────────────────────

async function ensureLocalDir(tenantId: string): Promise<string> {
  const dir = join(MEDIA_DIR, tenantId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

async function saveLocalFile(tenantId: string, assetId: string, fileName: string, data: Buffer): Promise<string> {
  const dir = await ensureLocalDir(tenantId);
  const ext = fileName.split('.').pop() || '';
  const storageKey = `${tenantId}/${assetId}.${ext}`;
  const filePath = join(MEDIA_DIR, storageKey);
  await writeFile(filePath, data);
  return storageKey;
}

async function readLocalFile(storageKey: string): Promise<{ data: Buffer; ext: string }> {
  const filePath = join(MEDIA_DIR, storageKey);
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

// ─── S3 Client ────────────────────────────────────────────────────────────────

const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

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
// Backend receives file as base64, converts to WebP, saves locally
export async function directUploadAsset(
  tenantId: string,
  input: DirectUploadInput,
  actorId: string,
  req?: Request,
): Promise<MediaAssetRow> {
  const assetId = uuidv4();
  let fileBuffer = Buffer.from(input.file_data, 'base64');

  // Auto-convert to WebP for images
  if (input.mime_type.startsWith('image/') && input.mime_type !== 'image/webp') {
    fileBuffer = await convertToWebp(fileBuffer, input.mime_type);
  }

  const webpFileName = input.file_name.replace(/\.[^.]+$/, '.webp');
  const storageKey = await saveLocalFile(tenantId, assetId, webpFileName, fileBuffer);

  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `INSERT INTO media_assets (asset_id, tenant_id, uploader_id, file_name, file_hash, mime_type, storage_key, redaction_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'NONE')
     RETURNING *`,
    [
      assetId,
      tenantId,
      actorId,
      webpFileName,
      `size:${fileBuffer.length}`,
      'image/webp',
      storageKey,
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

// ─── Presigned Upload URL (S3/MinIO) ─────────────────────────────────────────
export async function createPresignedUpload(
  tenantId: string,
  input: UploadRequestInput,
  actorId: string,
  req?: Request,
): Promise<{ uploadUrl: string; asset: MediaAssetRow }> {
  const assetId = uuidv4();
  const fileExtension = input.file_name.split('.').pop();
  const storageKey = `${tenantId}/${assetId}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: storageKey,
    ContentType: input.mime_type,
  });

  let uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  // Replace http:// with https:// to avoid Mixed Content when browser uploads
  uploadUrl = uploadUrl.replace('http://', 'https://');

  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `INSERT INTO media_assets (asset_id, tenant_id, uploader_id, file_name, file_hash, mime_type, storage_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      assetId,
      tenantId,
      actorId,
      input.file_name,
      input.file_hash,
      input.mime_type,
      storageKey,
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

// ─── Get Object from Local Storage ──────────────────────────────────────────
export async function getAssetObject(
  tenantId: string,
  assetId: string,
): Promise<{ Body: Buffer; ContentType: string; file_name: string }> {
  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `SELECT * FROM media_assets WHERE asset_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [assetId, tenantId]
  );

  if (rows.length === 0) {
    throw new NotFoundError('MediaAsset', assetId);
  }

  const asset = rows[0]!;
  const { data } = await readLocalFile(asset.storage_key);

  return {
    Body: data,
    ContentType: asset.mime_type,
    file_name: asset.file_name,
  };
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
