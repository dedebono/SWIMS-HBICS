import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as mediaService from '../services/media.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const uploadRequestSchema = z.object({
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  file_hash: z.string().min(1), // Should be validated by frontend before upload
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

// ─── GET /api/cases/:caseId/media ────────────────────────────────────────────

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
