import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as consentService from '../services/consent.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const createConsentSchema = z.object({
  student_id: z.string().uuid(),
  given_by: z.enum(['PARENT', 'GUARDIAN', 'STUDENT']),
  given_by_user_id: z.string().uuid().optional(),
  consent_type: z.string().min(1),
  version: z.string().min(1),
  granted: z.boolean(),
  expires_at: z.string().datetime().optional(),
});

const revokeConsentSchema = z.object({
  reason: z.string().min(1),
});

// ─── POST /api/consents ───────────────────────────────────────────────────

router.post(
  '/consents',
  checkPermission('consents', 'create'),
  asyncHandler(async (req, res) => {
    const body = createConsentSchema.parse(req.body);
    const created = await consentService.createConsent(
      req.tenantId,
      body,
      req.userId,
      req,
    );
    sendCreated(res, created);
  }),
);

// ─── GET /api/students/:studentId/consents ───────────────────────────────

router.get(
  '/students/:studentId/consents',
  checkPermission('consents', 'read'),
  asyncHandler(async (req, res) => {
    const consents = await consentService.getConsentsByStudent(
      req.tenantId,
      String(req.params['studentId']),
    );
    sendSuccess(res, consents);
  }),
);

// ─── PATCH /api/consents/:consentId/revoke ──────────────────────────────────

router.patch(
  '/consents/:consentId/revoke',
  checkPermission('consents', 'update'),
  asyncHandler(async (req, res) => {
    const body = revokeConsentSchema.parse(req.body);
    const updated = await consentService.revokeConsent(
      req.tenantId,
      String(req.params['consentId']),
      body.reason,
      req.userId,
      req,
    );
    sendSuccess(res, updated);
  }),
);

export default router;
