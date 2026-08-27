import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { setTenantFromSlug } from '../middleware/tenant.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import * as bookingService from '../services/staff-booking.service.js';
import { verifyNik } from '../services/staff-quisioner.service.js';

const router = Router();

// ── PUBLIC (anonymous, identified by tenant slug in ?t=) ─────────────────────
router.get('/counseling/booking/config', setTenantFromSlug, asyncHandler(async (req, res) => {
  sendSuccess(res, await bookingService.listCounselorAvailability((req as any).tenantId));
}));

router.post('/counseling/booking/verify', setTenantFromSlug, asyncHandler(async (req, res) => {
  const { nik } = req.body as { nik: string };
  sendSuccess(res, await verifyNik((req as any).tenantId, nik));
}));

router.post('/counseling/booking/submit', setTenantFromSlug, asyncHandler(async (req, res) => {
  const { nik, full_name, gender, slot_id } = req.body as {
    nik: string;
    full_name: string;
    gender: string;
    slot_id: string;
  };
  const tenantId = (req as any).tenantId;
  try {
    const result = await bookingService.bookStaffCounseling(tenantId, { nik, full_name, gender, slot_id });
    sendCreated(res, result);
  } catch (e: any) {
    const code = e.statusCode;
    if (code === 422 || code === 404 || code === 409) {
      res.status(code).json({ message: e.message });
      return;
    }
    throw e;
  }
}));

export default router;
