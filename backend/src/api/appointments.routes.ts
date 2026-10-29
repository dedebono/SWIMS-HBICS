import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as appointmentService from '../services/appointments.service.js';
import * as referralService from '../services/psychologist-referral.service.js';
import { notifyProfessional } from '../services/notifications.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const createPersonalSchema = z.object({
  created_for: z.string().uuid(),
  counselor_id: z.string().uuid().optional(),
  location: z.enum(['online', 'offline']).optional(),
  notes: z.string().optional(),
});

const mediateSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
  scheduled_at: z.union([z.string(), z.null()]).optional(),
  location: z.enum(['online', 'offline']).optional(),
  notes: z.string().optional(),
});

// ─── APPOINTMENTS ────────────────────────────────────────────────────────────

router.get(
  '/',
  checkPermission('appointments', 'read'),
  asyncHandler(async (req, res) => {
    const items = await appointmentService.listAppointments(req.tenantId, {
      created_for: req.query.created_for as string | undefined,
      student_id: req.query.student_id as string | undefined,
      counselor_id: req.query.counselor_id as string | undefined,
      psychologist_id: req.query.psychologist_id as string | undefined,
      status: req.query.status as string | undefined,
      type: req.query.type as 'student' | 'personal' | undefined,
    });
    sendSuccess(res, items);
  }),
);

// Reschedule — MUST be before /:appointmentId
router.patch(
  '/:appointmentId/reschedule',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const { new_slot_id, old_slot_id } = req.body as { new_slot_id: string; old_slot_id: string };
    const appointment = await appointmentService.getAppointment(req.tenantId, req.params.appointmentId);
    if (!appointment) return res.status(404).json({ message: 'Appointment tidak ditemukan' });

    const { rows: newSlots } = await (require('../db/pool').queryWithTenant as any)(
      req.tenantId,
      `SELECT * FROM availability_slots WHERE slot_id = $1 AND deleted_at IS NULL`,
      [new_slot_id],
    );
    const newSlot = newSlots[0];
    if (!newSlot) return res.status(404).json({ message: 'Slot baru tidak ditemukan' });
    if (!newSlot.is_available || newSlot.appointment_id) {
      return res.status(409).json({ message: 'Slot sudah terisi' });
    }

    await (require('../db/pool').queryWithTenant as any)(
      req.tenantId,
      `UPDATE appointments SET scheduled_at = $1, updated_at = now() WHERE appointment_id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
      [newSlot.slot_start, req.params.appointmentId, req.tenantId],
    );

    await (require('../db/pool').queryWithTenant as any)(
      req.tenantId,
      `UPDATE availability_slots SET is_available = true, appointment_id = NULL, updated_at = now() WHERE slot_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [old_slot_id, req.tenantId],
    );

    await (require('../db/pool').queryWithTenant as any)(
      req.tenantId,
      `UPDATE availability_slots SET is_available = false, appointment_id = $1, updated_at = now() WHERE slot_id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
      [req.params.appointmentId, new_slot_id, req.tenantId],
    );

    // "Jadwal update" — kabari profesional pemilik jadwal. Never throws.
    if (appointment.counselor_id) {
      await notifyProfessional(req.tenantId, appointment.counselor_id, {
        type: 'SCHEDULE_UPDATE',
        title: 'Jadwal diubah',
        body: `Janji temu dipindahkan ke ${new Date(newSlot.slot_start).toLocaleString('id-ID')}.`,
      });
    }

    sendSuccess(res, { appointment_id: req.params.appointmentId, new_slot_id, new_scheduled_at: newSlot.slot_start });
  }),
);

// Static path — MUST come BEFORE /:appointmentId, or "counselors" is matched
// as an appointmentId and this handler is unreachable (always 404).
router.get(
  '/counselors',
  checkPermission('appointments', 'read'),
  asyncHandler(async (req, res) => {
    const { rows } = await (require('../db/pool').queryWithTenant as any)(
      req.tenantId,
      `SELECT user_id, full_name, gender FROM users WHERE role = 'COUNSELOR' AND is_active = true ORDER BY full_name ASC`,
    );
    sendSuccess(res, rows);
  }),
);

router.get(
  '/:appointmentId',
  checkPermission('appointments', 'read'),
  asyncHandler(async (req, res) => {
    const item = await appointmentService.getAppointment(req.tenantId, req.params.appointmentId);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.post(
  '/',
  checkPermission('appointments', 'create'),
  asyncHandler(async (req, res) => {
    const item = await appointmentService.createAppointment(req.tenantId, {
      ...req.body,
      created_by: req.userId,
    });
    // "Permintaan janji temu baru" untuk profesional yang dituju. Never throws.
    if (item?.counselor_id) {
      await notifyProfessional(req.tenantId, item.counselor_id, {
        type: 'APPOINTMENT_REQUEST',
        title: 'Permintaan janji temu baru',
        body: 'Ada permintaan janji temu baru menunggu konfirmasi.',
      });
    }
    sendCreated(res, item);
  }),
);

// Personal staff appointment
router.post(
  '/personal',
  checkPermission('appointments', 'create'),
  asyncHandler(async (req, res) => {
    const body = createPersonalSchema.parse(req.body);
    const result = await appointmentService.createPersonalAppointment(req.tenantId, {
      ...body,
      actor_id: req.userId!,
    });
    // "Permintaan janji temu baru" untuk konselor yang ter-match. Never throws.
    await notifyProfessional(req.tenantId, result.matched_counselor_id, {
      type: 'APPOINTMENT_REQUEST',
      title: 'Permintaan janji temu baru',
      body: 'Ada permintaan janji temu personal baru menunggu konfirmasi.',
    });
    sendCreated(res, result);
  }),
);

// ─── Parent WA invite (sent from the case's "Janji Temu Terkait") ────────────

// Modal prefill: student name + known parent phone.
// Permission is `cases.update`, not `appointments.update` — the invite is part
// of handling the case, and the questionnaire-filling TEACHER (read-only on
// appointments by design) is exactly who sends it.
router.get(
  '/:appointmentId/referral-context',
  checkPermission('cases', 'update'),
  asyncHandler(async (req, res) => {
    const ctx = await referralService.getReferralContext(req.tenantId, req.params.appointmentId);
    if (!ctx) return res.status(404).json({ message: 'Janji temu tidak ditemukan' });
    sendSuccess(res, ctx);
  }),
);

// Send the invite: teacher-edited message template + parent phone (override if
// the student has none). The referral link is appended server-side.
router.post(
  '/:appointmentId/referral',
  checkPermission('cases', 'update'),
  asyncHandler(async (req, res) => {
    const { parent_phone, message } = req.body as { parent_phone?: string; message?: string };
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Pesan undangan wajib diisi' });
    }
    try {
      const result = await referralService.sendParentInvite(req.tenantId, req.params.appointmentId, req.userId!, {
        parentPhone: parent_phone,
        message,
      });
      if (!result.success) {
        return res.status(502).json({ message: 'GOWA tidak mengirim pesan — periksa konfigurasi WhatsApp.' });
      }
      sendSuccess(res, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirim undangan';
      const status = /tidak ditemukan/.test(msg) ? 404 : /belum tersedia/.test(msg) ? 400 : 500;
      res.status(status).json({ message: msg });
    }
  }),
);

router.patch(
  '/:appointmentId/status',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body as { status: string; notes?: string };
    const item = await appointmentService.updateAppointmentStatus(req.tenantId, req.params.appointmentId, status, req.userId, notes);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.post(
  '/:appointmentId/confirm',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const { scheduled_at } = req.body as { scheduled_at: string };
    const item = await appointmentService.confirmAppointment(req.tenantId, req.params.appointmentId, scheduled_at, req.userId);
    if (!item) return res.status(404).json({ message: 'Not found' });
    // "Jadwal update" — konfirmasi jadwal untuk profesional. Never throws.
    if (item.counselor_id) {
      await notifyProfessional(req.tenantId, item.counselor_id, {
        type: 'SCHEDULE_UPDATE',
        title: 'Jadwal dikonfirmasi',
        body: `Janji temu dikonfirmasi pada ${new Date(scheduled_at).toLocaleString('id-ID')}.`,
      });
    }
    sendSuccess(res, item);
  }),
);

router.patch(
  '/:appointmentId/notes',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const { notes } = req.body as { notes: string };
    const item = await appointmentService.updateAppointmentNotes(req.tenantId, req.params.appointmentId, req.userId, notes);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.patch(
  '/:appointmentId/mediate',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const body = mediateSchema.parse(req.body);
    const item = await appointmentService.mediateAppointment(req.tenantId, req.params.appointmentId, req.userId, body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

export default router;
