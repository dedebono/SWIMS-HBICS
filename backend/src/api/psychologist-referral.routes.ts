import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { setTenantFromSlug } from '../middleware/tenant.middleware.js';
import { sendSuccess, sendCreated, sendError } from '../utils/response.js';
import * as svc from '../services/psychologist-referral.service.js';

const router = Router();

// All routes: tenant identified by slug, no auth needed
router.use(setTenantFromSlug);

// GET /api/public/psychologist-referral/psychologists?t=<slug>&token=<token>
router.get('/psychologists', asyncHandler(async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) return sendError(res, 'Token required', 400);

  const tokenRecord = await svc.getTokenRecord((req as any).tenantId, token);
  if (!tokenRecord) return sendError(res, 'Token tidak valid atau sudah expire', 410);

  const psychologists = await svc.listSchoolPsychologists((req as any).tenantId);
  sendSuccess(res, { psychologists, tokenRecord });
}));

// POST /api/public/psychologist-referral/choice?t=<slug>
router.post('/choice', asyncHandler(async (req, res) => {
  const { token, choice } = req.body as {
    token: string;
    choice: 'school_psychologist' | 'private_psychologist';
  };
  if (!token || !choice) return sendError(res, 'Token and choice required', 400);
  if (!['school_psychologist', 'private_psychologist'].includes(choice)) {
    return sendError(res, 'Invalid choice', 400);
  }

  const record = await svc.recordParentChoice((req as any).tenantId, token, choice);
  sendSuccess(res, record);
}));

// POST /api/public/psychologist-referral/select-psychologist?t=<slug>
router.post('/select-psychologist', asyncHandler(async (req, res) => {
  const { token, psychologistId } = req.body as { token: string; psychologistId: string };
  if (!token || !psychologistId) return sendError(res, 'Token and psychologistId required', 400);

  const record = await svc.selectPsychologist((req as any).tenantId, token, psychologistId);
  sendSuccess(res, record);
}));

// POST /api/public/psychologist-referral/set-payment-pending?t=<slug>
router.post('/set-payment-pending', asyncHandler(async (req, res) => {
  const { token } = req.body as { token: string };
  if (!token) return sendError(res, 'Token required', 400);
  const record = await svc.setPaymentPending((req as any).tenantId, token);
  sendSuccess(res, record);
}));

// POST /api/public/psychologist-referral/confirm-payment?t=<slug>
router.post('/confirm-payment', asyncHandler(async (req, res) => {
  const { token, notes } = req.body as { token: string; notes?: string };
  if (!token) return sendError(res, 'Token required', 400);
  const record = await svc.confirmPayment((req as any).tenantId, token, notes);
  sendSuccess(res, record);
}));

// GET /api/public/psychologist-referral/slots?t=<slug>&token=<token>
// Free future slots of the psychologist the parent selected.
router.get('/slots', asyncHandler(async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) return sendError(res, 'Token required', 400);

  const slots = await svc.listParentSlots((req as any).tenantId, token);
  sendSuccess(res, slots);
}));

// POST /api/public/psychologist-referral/confirm-schedule?t=<slug>
// Books the chosen slot: token → schedule_confirmed, appointment → confirmed
// (scheduled_at + psychologist_id), slot marked taken — in one transaction.
router.post('/confirm-schedule', asyncHandler(async (req, res) => {
  const { token, slot_id } = req.body as { token: string; slot_id: string };
  if (!token || !slot_id) return sendError(res, 'Token and slot_id required', 400);
  try {
    const record = await svc.confirmSchedule((req as any).tenantId, token, slot_id);
    sendSuccess(res, record);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal mengonfirmasi jadwal';
    sendError(res, msg, /tidak tersedia|sudah diisi/.test(msg) ? 409 : 400);
  }
}));

export default router;
