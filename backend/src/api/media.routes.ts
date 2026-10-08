import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as mediaService from '../services/media.service.js';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import type { JwtPayload } from '@swims/shared';

const router = Router();

// ─── GET /api/media/:assetId/download ─────────────────────────────────────────
// MUST stay registered ABOVE router.use(authenticate, ...).
// <img>/<video>/<audio> tags cannot send an `Authorization` header, so this route
// authenticates via the HMAC-signed ?token= that listAssetsForCase() issues.
// If it sits below router.use(authenticate), every thumbnail 401s with
// "Missing or malformed Authorization header" before the token is ever checked.
router.get(
  '/:assetId/download',
  asyncHandler(async (req, res) => {
    const assetId = String(req.params['assetId']);
    const token = req.query['token'] as string | undefined;

    let tenantId: string;
    let userId: string;

    if (token) {
      // Signed-token auth for tag-based rendering (<img>, <video>, <audio>)
      userId = mediaService.validateDownloadToken(token);
      // System-level lookup: no tenant context is set yet on this route.
      const { rows } = await pool.query<{ tenant_id: string; user_id: string }>(
        'SELECT tenant_id, user_id FROM users WHERE user_id = $1',
        [userId],
      );
      if (!rows || rows.length === 0) {
        throw new UnauthorizedError('User not found');
      }
      const owner = rows[0]!;
      tenantId = owner.tenant_id;
      userId = owner.user_id;
    } else {
      // JWT fallback for programmatic fetches (apiClient sends the header).
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Authentication required');
      }
      const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as JwtPayload;
      userId = payload.user_id;
      tenantId = payload.tenant_id;
    }

    const { Body, ContentType, file_name } = await mediaService.getAssetObject(tenantId, assetId);
    res.setHeader('Content-Type', ContentType);
    res.setHeader('Content-Disposition', `inline; filename="${file_name}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Body);
  }),
);

// Everything below this line requires a JWT.
router.use(authenticate, setTenantContext);

const uploadRequestSchema = z.object({
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  file_hash: z.string().min(1),
});

const directUploadSchema = z.object({
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  file_data: z.string().min(1), // base64 encoded
});

const linkAssetSchema = z.object({
  case_id: z.string().uuid().optional(),
  incident_id: z.string().uuid().optional(),
});

// ─── POST /api/media/direct-upload ─────────────────────────────────────────────
// Upload file through backend (avoids Mixed Content since browser→HTTPS backend)
router.post(
  '/direct-upload',
  checkPermission('media_assets', 'create'),
  asyncHandler(async (req, res) => {
    const body = directUploadSchema.parse(req.body);
    const asset = await mediaService.directUploadAsset(
      req.tenantId,
      body,
      req.userId,
      req,
    );
    sendCreated(res, { asset_id: asset.asset_id, file_name: asset.file_name });
  }),
);

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

export default router;
