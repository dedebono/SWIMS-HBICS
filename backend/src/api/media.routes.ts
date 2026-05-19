import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { getClientWithTenant } from '../db/pool.js';
import * as mediaService from '../services/media.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC "Presigned-URL-Style" endpoints (no auth required — secured by assetId+tenantId)
// These must be registered BEFORE router.use(authenticate) so they are not blocked.
// ─────────────────────────────────────────────────────────────────────────────

// ─── PUT /api/media/upload/local ─────────────────────────────────────────────
// The frontend calls this URL exactly like an S3 presigned PUT URL.

router.put(
  '/upload/local',
  asyncHandler(async (req, res) => {
    const assetId = req.query['assetId'] as string;
    const tenantId = req.query['tenantId'] as string;

    if (!assetId || !tenantId) {
      return res.status(400).json({ error: 'Missing assetId or tenantId' });
    }

    const client = await getClientWithTenant(tenantId);
    let storageKey = '';

    try {
      const { rows } = await client.query(
        'SELECT storage_key FROM media_assets WHERE asset_id = $1 AND tenant_id = $2',
        [assetId, tenantId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      storageKey = rows[0].storage_key;
    } finally {
      client.release();
    }

    const uploadPath = path.resolve(process.cwd(), storageKey);
    const uploadDir = path.dirname(uploadPath);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(uploadPath);
    req.pipe(writeStream);

    req.on('end', () => {
      res.status(200).send('OK');
    });

    req.on('error', (err) => {
      console.error('Error uploading file locally:', err);
      res.status(500).send('Internal Server Error');
    });
  }),
);

// ─── GET /api/media/download/local ───────────────────────────────────────────
// The browser's <img> / <video> / <audio> tags call this directly.
// Security: assetId + tenantId act like a presigned token.

router.get(
  '/download/local',
  asyncHandler(async (req, res) => {
    const assetId = req.query['assetId'] as string;
    const tenantId = req.query['tenantId'] as string;

    if (!assetId || !tenantId) {
      return res.status(400).json({ error: 'Missing assetId or tenantId' });
    }

    const client = await getClientWithTenant(tenantId);
    let storageKey = '';
    let mimeType = '';

    try {
      const { rows } = await client.query(
        'SELECT storage_key, mime_type FROM media_assets WHERE asset_id = $1 AND tenant_id = $2',
        [assetId, tenantId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      storageKey = rows[0].storage_key;
      mimeType = rows[0].mime_type;
    } finally {
      client.release();
    }

    const downloadPath = path.resolve(process.cwd(), storageKey);

    if (!fs.existsSync(downloadPath)) {
      return res.status(404).json({ error: 'File not found on local disk' });
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    // Allow cross-origin embedding in <img>/<video>/<audio> tags
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(downloadPath);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED endpoints — all routes below require a valid Bearer token
// ─────────────────────────────────────────────────────────────────────────────

router.use(authenticate, setTenantContext);

const uploadRequestSchema = z.object({
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  file_hash: z.string().min(1),
});

const linkAssetSchema = z.object({
  case_id: z.string().uuid().optional(),
  incident_id: z.string().uuid().optional(),
});

// ─── POST /api/media/upload ──────────────────────────────────────────────────

router.post(
  '/upload',
  checkPermission('media_assets', 'create'),
  asyncHandler(async (req, res) => {
    const body = uploadRequestSchema.parse(req.body);
    const result = await mediaService.createPresignedUpload(
      req.tenantId,
      body,
      req.userId,
      req,
    );
    sendCreated(res, result);
  }),
);

// ─── POST /api/media/:assetId/link ───────────────────────────────────────────

router.post(
  '/:assetId/link',
  checkPermission('media_assets', 'update'),
  asyncHandler(async (req, res) => {
    const body = linkAssetSchema.parse(req.body);
    const updated = await mediaService.linkAsset(
      req.tenantId,
      String(req.params['assetId']),
      body,
      req.userId,
      req,
    );
    sendSuccess(res, updated);
  }),
);

// ─── POST /api/media/:assetId/redact ─────────────────────────────────────────

router.post(
  '/:assetId/redact',
  checkPermission('media_assets', 'update'),
  asyncHandler(async (req, res) => {
    const updated = await mediaService.triggerRedaction(
      req.tenantId,
      String(req.params['assetId']),
      req.userId,
      req,
    );
    sendSuccess(res, updated);
  }),
);

// ─── GET /api/media/:assetId ─────────────────────────────────────────────────
// Returns a download URL for a given asset (resolves to local or S3 presigned).

router.get(
  '/:assetId',
  checkPermission('media_assets', 'read'),
  asyncHandler(async (req, res) => {
    const result = await mediaService.getAssetDownloadUrl(
      req.tenantId,
      String(req.params['assetId']),
      req.userId,
      req,
    );
    sendSuccess(res, result);
  }),
);

// ─── GET /api/cases/:caseId/media (legacy — kept for compatibility) ───────────

router.get(
  '/cases/:caseId/media',
  checkPermission('media_assets', 'read'),
  asyncHandler(async (req, res) => {
    const assets = await mediaService.listAssetsForCase(
      req.tenantId,
      String(req.params['caseId']),
    );
    sendSuccess(res, assets);
  }),
);

export default router;
