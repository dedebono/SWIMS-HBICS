import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { getClientWithTenant } from '../db/pool.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const settingsSchema = z.object({
  ai: z.object({
    aiEnabled: z.boolean(),
    aiApiUrl: z.string().optional(),
    aiApiKey: z.string().optional(),
  }).optional(),
  storage: z.object({
    storageProvider: z.enum(['s3', 'firebase', 'cloudflare_r2', 'google_drive']),
    firebaseApiKey: z.string().optional(),
    firebaseProjectId: z.string().optional(),
    firebaseStorageBucket: z.string().optional(),
    r2AccountId: z.string().optional(),
    r2AccessKeyId: z.string().optional(),
    r2SecretAccessKey: z.string().optional(),
    r2BucketName: z.string().optional(),
    gdriveClientId: z.string().optional(),
    gdriveClientSecret: z.string().optional(),
    gdriveRefreshToken: z.string().optional(),
    gdriveFolderId: z.string().optional()
  }).optional()
});

const checkAiSchema = z.object({
  aiApiUrl: z.string().url(),
  aiApiKey: z.string()
});

// Middleware to enforce IT_ADMIN
const requireItAdmin = (req: any, res: any, next: any) => {
  if (req.userRole !== 'IT_ADMIN') {
    return res.status(403).json({ success: false, error: { message: "Only IT_ADMIN can manage settings" } });
  }
  next();
};

// ─── GET /api/admin/settings ─────────────────────────────────────────────────

router.get(
  '/settings',
  requireItAdmin,
  asyncHandler(async (req, res) => {
    const client = await getClientWithTenant(req.tenantId);
    try {
      const { rows } = await client.query('SELECT settings FROM tenants WHERE tenant_id = $1', [req.tenantId]);
      sendSuccess(res, rows[0]?.settings || {});
    } finally {
      client.release();
    }
  })
);

// ─── PATCH /api/admin/settings ───────────────────────────────────────────────

router.patch(
  '/settings',
  requireItAdmin,
  asyncHandler(async (req, res) => {
    const updates = settingsSchema.parse(req.body);
    const client = await getClientWithTenant(req.tenantId);

    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT settings FROM tenants WHERE tenant_id = $1 FOR UPDATE', [req.tenantId]);
      const currentSettings = rows[0]?.settings || {};
      
      const newSettings = {
        ...currentSettings,
        ...updates,
        ai: { ...currentSettings.ai, ...updates.ai },
        storage: { ...currentSettings.storage, ...updates.storage }
      };

      await client.query('UPDATE tenants SET settings = $1 WHERE tenant_id = $2', [JSON.stringify(newSettings), req.tenantId]);
      await client.query('COMMIT');

      sendSuccess(res, newSettings);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── POST /api/admin/ai/check-connection ─────────────────────────────────────

router.post(
  '/ai/check-connection',
  requireItAdmin,
  asyncHandler(async (req, res) => {
    const body = checkAiSchema.parse(req.body);

    try {
      // Very basic connection ping. Works for OpenAI-compatible endpoints like LMStudio/Ollama
      const pingResponse = await fetch(body.aiApiUrl, {
        method: 'GET', // Or a minimal POST request depending on the provider, but many expose a health or models endpoint
        headers: {
          'Authorization': `Bearer ${body.aiApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!pingResponse.ok) {
        throw new Error(`Failed to connect: ${pingResponse.statusText}`);
      }

      sendSuccess(res, { connected: true, message: 'AI connection successful' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message || 'Connection failed' } });
    }
  })
);

export default router;
