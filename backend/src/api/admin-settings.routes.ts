import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { getClientWithTenant } from '../db/pool.js';
import { sendSuccess } from '../utils/response.js';
import { invalidateTenantSettings } from '../services/tenant-settings.service.js';

const router = Router();

/** Fetch with 10s timeout */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
}

router.use(authenticate, setTenantContext);

/**
 * Settings contract — every category the UI can save must exist here.
 *
 * Zod strips unknown keys by default, which is how `waha` and `email` silently
 * vanished: the frontend sent them, the schema never declared them, the PATCH
 * still returned 200 with the values missing, and the UI reported success.
 * A regression test asserts each category round-trips (see
 * `__tests__/admin-settings.routes.test.ts`).
 *
 * Field names are the ones the READERS use, not the ones the form happens to
 * use — `ai-insights.service.ts` reads `enabled` / `apiUrl` / `apiKey`, so
 * declaring `aiEnabled` / `aiApiUrl` / `aiApiKey` stored values nothing could
 * ever find.
 */
// Provider ids come in two spellings in the wild: the short ones used by the
// backend driver registry (local/s3/r2/firebase/gdrive) and the longer ones this
// form has always sent. Both are accepted; storage.drivers.ts normalises them to
// a single id.
const storageProviderEnum = z.enum([
  'local', 's3', 'r2', 'firebase', 'gdrive',
  'cloudflare_r2', 'google_drive', 'amazon_s3',
]);

const settingsSchema = z.object({
  ai: z.object({
    enabled: z.boolean().optional(),
    provider: z.string().optional(),
    apiUrl: z.string().optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
  }).optional(),

  // Provider ids come in two spellings in the wild: the short ones used by the
  // backend driver registry (local/s3/r2/firebase/gdrive) and the longer ones
  // this form has always sent. Both are accepted; storage.drivers.ts
  // normalises them to a single id.
  storage: z.object({
    // `provider` is what the form edits; `storageProvider` is the legacy key
    // written by older builds. Accept both so existing rows keep working.
    provider: storageProviderEnum.optional(),
    storageProvider: storageProviderEnum.optional(),
    bucket: z.string().optional(),
    region: z.string().optional(),
    endpoint: z.string().optional(),
    accessKey: z.string().optional(),
    secretKey: z.string().optional(),
    publicUrl: z.string().optional(),

    // Canonical names used by the driver layer.
    accountId: z.string().optional(),
    firebaseBucket: z.string().optional(),
    /** Service-account JSON — object or raw string; parsed on read. */
    serviceAccount: z.union([z.string(), z.record(z.unknown())]).nullable().optional(),
    driveFolderId: z.string().optional(),
    driveSharedDriveId: z.string().optional(),

    // Names this form has always sent. Read on top of the canonical ones so an
    // existing saved configuration keeps working without the admin re-entering
    // it. See tenant-settings.service.ts, which maps them across.
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
    gdriveFolderId: z.string().optional(),
    gdriveSharedDriveId: z.string().optional(),
  }).optional(),

  waha: z.object({
    url: z.string().optional(),
    session: z.string().optional(),
    apiKey: z.string().optional(),
  }).optional(),

  email: z.object({
    host: z.string().optional(),
    port: z.coerce.number().optional(),
    secure: z.boolean().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    from: z.string().optional(),
  }).optional(),
});

/** Every category the UI has a "Simpan" button for. */
const SETTING_CATEGORIES = ['ai', 'storage', 'waha', 'email'] as const;

const checkAiSchema = z.object({
  ai: z.object({
    apiUrl: z.string().url(),
    apiKey: z.string()
  })
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

      // Merge per category, field by field. A plain top-level spread would let a
      // PATCH for one category blank out the others, and undefined fields must be
      // dropped so a partial save never clears a stored secret.
      const newSettings: Record<string, unknown> = { ...currentSettings };
      for (const category of SETTING_CATEGORIES) {
        const incoming = updates[category];
        if (!incoming) continue;
        newSettings[category] = {
          ...(currentSettings[category] as Record<string, unknown> | undefined),
          ...Object.fromEntries(Object.entries(incoming).filter(([, v]) => v !== undefined)),
        };
      }

      await client.query('UPDATE tenants SET settings = $1 WHERE tenant_id = $2', [JSON.stringify(newSettings), req.tenantId]);
      await client.query('COMMIT');

      // The readers cache for 30s; drop it now so the admin's change takes effect
      // on the very next request instead of after the TTL.
      invalidateTenantSettings(req.tenantId);

      // Never report success for a value that was dropped. If a category came in
      // but nothing of it survived, say so instead of echoing an empty object.
      const dropped = SETTING_CATEGORIES.filter((c) => {
        const incoming = updates[c] as Record<string, unknown> | undefined;
        if (!incoming) return false;
        const stored = newSettings[c] as Record<string, unknown>;
        return Object.keys(incoming).some((k) => incoming[k] !== undefined && stored[k] === undefined);
      });

      if (dropped.length > 0) {
        res.status(422).json({
          success: false,
          data: null,
          error: `Pengaturan tidak disimpan untuk: ${dropped.join(', ')}. Format data tidak dikenali.`,
        });
        return;
      }

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
    // Accept BOTH shapes: the UI form uses apiUrl/apiKey, but older clients
    // (and anything cached in the browser) still send aiApiUrl/aiApiKey.
    const raw = body.ai as Record<string, unknown>;
    const aiApiUrl = String(raw.apiUrl ?? raw.aiApiUrl ?? '');
    const aiApiKey = String(raw.apiKey ?? raw.aiApiKey ?? '');

    // Normalise: strip trailing /v1 (user might enter "https://api.openai.com/v1" already)
    const baseUrl = aiApiUrl.replace(/\/v1\/?$/, '');

    try {
      // Try /v1/models endpoint first (OpenAI-compatible standard)
      let pingResponse = await fetchWithTimeout(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${aiApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      // If /v1/models returns 404, try base URL as fallback (e.g. for Ollama / LM Studio)
      if (pingResponse.status === 404) {
        pingResponse = await fetchWithTimeout(baseUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${aiApiKey}`,
            'Content-Type': 'application/json'
          }
        });
      }

      if (!pingResponse.ok) {
        throw new Error(`HTTP ${pingResponse.status}: ${pingResponse.statusText}`);
      }

      sendSuccess(res, { connected: true, message: 'AI connection successful' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message || 'Connection failed. Please check the URL and API key.' } });
    }
  })
);

export default router;
