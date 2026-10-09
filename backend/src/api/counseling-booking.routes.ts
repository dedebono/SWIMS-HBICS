import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { setTenantFromSlug } from '../middleware/tenant.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { EmployeeCounselingSubmissionSchema } from '@swims/shared';
import * as bookingService from '../services/staff-booking.service.js';
import * as combinedService from '../services/employee-counseling-booking.service.js';
import { verifyNik } from '../services/staff-booking.service.js';

const router = Router();

/**
 * Shared 422 envelope. The combined endpoint validates the questionnaire with
 * Zod, and the frontend apiClient reads `error` — a bare `{message}` leaves the
 * employee staring at a generic failure toast with no clue what was wrong.
 */
function sendValidationError(res: import('express').Response, err: { flatten(): { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> } }): void {
  const flat = err.flatten();
  const fields = [
    ...Object.entries(flat.fieldErrors).map(([k, v]) => `${k}: ${(v ?? []).join(', ')}`),
    ...flat.formErrors,
  ];
  res.status(422).json({
    success: false,
    data: null,
    error: fields.length
      ? `Data belum lengkap / tidak valid — ${fields.slice(0, 3).join(' | ')}`
      : 'Data belum lengkap / tidak valid.',
    details: flat,
  });
}

// ── PUBLIC (anonymous, identified by tenant slug in ?t=) ─────────────────────
// GET /api/counseling/booking/config
router.get('/booking/config', setTenantFromSlug, asyncHandler(async (req, res) => {
  sendSuccess(res, await bookingService.listCounselorAvailability((req as any).tenantId));
}));

router.post('/booking/verify', setTenantFromSlug, asyncHandler(async (req, res) => {
  const { nik } = req.body as { nik: string };
  sendSuccess(res, await verifyNik((req as any).tenantId, nik));
}));

router.post('/booking/submit', setTenantFromSlug, asyncHandler(async (req, res) => {
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

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED FLOW — NIK verification + questionnaire + slot booking, one submit
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Step 1 of the combined flow. Unlike `/booking/verify`, this returns the
 * employee's real record (unit, position, contact) so the questionnaire can be
 * pre-filled instead of asking someone to re-type data the school already has,
 * plus `has_open_intake` so the page can explain rather than silently duplicate.
 */
router.post('/booking/verify-identity', setTenantFromSlug, asyncHandler(async (req, res) => {
  const { nik } = req.body as { nik: string };
  sendSuccess(res, await combinedService.verifyIdentityForCombined((req as any).tenantId, nik));
}));

/**
 * Final step: one request creates the appointment AND the counseling intake and
 * links them, so the counselor dashboard shows a single row per person.
 */
router.post('/booking/submit-combined', setTenantFromSlug, asyncHandler(async (req, res) => {
  const body = req.body as { nik?: string; slot_id?: string };
  const parsed = EmployeeCounselingSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  if (!body.nik?.trim()) {
    res.status(422).json({
      success: false,
      data: null,
      error: 'NIK wajib diisi untuk verifikasi identitas.',
    });
    return;
  }
  if (!body.slot_id?.trim()) {
    res.status(422).json({
      success: false,
      data: null,
      error: 'Silakan pilih jadwal konseling.',
    });
    return;
  }

  const tenantId = (req as any).tenantId;
  try {
    const result = await combinedService.submitCombinedIntake(tenantId, {
      ...parsed.data,
      nik: body.nik,
      slot_id: body.slot_id,
    });
    sendCreated(res, result);
  } catch (e: any) {
    const code = e.statusCode;
    if (code === 400 || code === 404 || code === 409 || code === 422) {
      res.status(code).json({ success: false, data: null, error: e.message });
      return;
    }
    throw e;
  }
}));

export default router;
