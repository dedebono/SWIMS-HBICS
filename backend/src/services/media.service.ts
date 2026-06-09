import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { NotFoundError } from '../utils/errors.js';
import { env } from '../config/env.js';
import type { MediaAssetRow } from '@swims/shared';
import type { Request } from 'express';

const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true, // Required for MinIO
});

export interface UploadRequestInput {
  file_name: string;
  mime_type: string;
  file_hash: string;
}

export interface LinkAssetInput {
  case_id?: string;
  incident_id?: string;
}

// ─── Generate Upload URL & Init Asset ────────────────────────────────────────

export async function createPresignedUpload(
  tenantId: string,
  input: UploadRequestInput,
  actorId: string,
  req?: Request,
): Promise<{ uploadUrl: string; asset: MediaAssetRow }> {
  const assetId = uuidv4();
  const fileExtension = input.file_name.split('.').pop();
  
  // Fetch tenant settings to check storage provider
  const { rows: tenantRows } = await queryWithTenant<{ settings: any }>(
    tenantId,
    `SELECT settings FROM tenants WHERE tenant_id = $1`,
    [tenantId]
  );
  
  const settings = tenantRows[0]?.settings || {};
  const isLocal = settings.storage?.storageProvider === 'local' || !settings.storage?.storageProvider;

  let uploadUrl = '';
  let storageKey = '';

  if (isLocal) {
    storageKey = `uploads/${tenantId}/${assetId}.${fileExtension}`;
    // Use relative URL so the browser uploads to the same origin as the API (no hardcoded localhost).
    uploadUrl = `/api/media/upload/local?assetId=${assetId}&tenantId=${tenantId}`;
  } else {
    storageKey = `${tenantId}/${assetId}.${fileExtension}`;
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      ContentType: input.mime_type,
    });
    uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }

  // Store metadata in DB (not linked to case/incident yet)
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
  // Update status to PENDING
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

  // (This is where you'd trigger a background worker, AWS Rekognition, etc.)
  // For MVP Phase 2, we leave it locally flagged as PENDING in DB.

  return updated;
}

// ─── Get Metadata & Download URL ─────────────────────────────────────────────

export async function getAssetDownloadUrl(
  tenantId: string,
  assetId: string,
  actorId: string, // Needed for tracking access logs
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
    
    // Check if it's local storage by looking at the storage_key
    const objectKey = asset.redaction_status === 'REDACTED' && asset.redacted_key
      ? asset.redacted_key
      : asset.storage_key;

    let url = '';
    if (objectKey.startsWith('uploads/')) {
      // Use relative URL so the browser downloads from the same origin as the API.
      url = `/api/media/download/local?assetId=${assetId}&tenantId=${tenantId}`;
    } else {
      const command = new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
      });
      url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    }

    // Mark access log in JSONB list of accesses
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

// ─── List Assets ─────────────────────────────────────────────────────────────

export async function listAssetsForCase(
  tenantId: string,
  caseId: string,
): Promise<MediaAssetRow[]> {
  const { rows } = await queryWithTenant<MediaAssetRow>(
    tenantId,
    `SELECT * FROM media_assets 
     WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [caseId, tenantId]
  );
  return rows;
}
