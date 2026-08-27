import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as referralService from '../services/referrals.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();
router.use(authenticate, setTenantContext);

// Counselor issues a psychologist referral for an appointment.
router.post(
  '/',
  checkPermission('appointments', 'create'),
  asyncHandler(async (req, res) => {
    const { appointment_id, reason, referral_type } = req.body as {
      appointment_id: string;
      reason: string;
      referral_type: 'internal_psychologist' | 'puspaga_external';
    };
    const r = await referralService.createReferral((req as any).tenantId, {
      appointment_id,
      reason,
      referral_type,
      recommended_by: (req as any).userId,
    });
    sendCreated(res, r);
  }),
);

// Counselor sees their own referrals; School Head sees the pending queue.
router.get(
  '/',
  checkPermission('appointments', 'read'),
  asyncHandler(async (req, res) => {
    const role = (req as any).userRole;
    const items = await referralService.listReferrals((req as any).tenantId, {
      role,
      userId: (req as any).userId,
    });
    sendSuccess(res, items);
  }),
);

// School Head (2nd approver) approves/rejects.
router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    if ((req as any).userRole !== 'SCHOOL_HEAD') {
      return res.status(403).json({ message: 'Hanya School Head yang dapat menyetujui rujukan.' });
    }
    const { approve, note } = req.body as { approve: boolean; note?: string };
    const r = await referralService.approveReferral(
      (req as any).tenantId,
      req.params.id,
      (req as any).userId,
      approve,
      note,
    );
    sendSuccess(res, r);
  }),
);

// Counselor / School Nurse records the external (Puspaga) consultation result back.
router.post(
  '/:id/external-result',
  asyncHandler(async (req, res) => {
    const role = (req as any).userRole;
    if (role !== 'COUNSELOR' && role !== 'SCHOOL_NURSE') {
      return res.status(403).json({ message: 'Hanya konselor/nurse yang dapat mengisi hasil konsultasi.' });
    }
    const { note } = req.body as { note: string };
    const r = await referralService.recordExternalResult((req as any).tenantId, req.params.id, (req as any).userId, note);
    sendSuccess(res, r);
  }),
);

export default router;
