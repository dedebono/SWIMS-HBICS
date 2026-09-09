import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as appointmentService from '../services/appointments.service.js';
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
  '/appointments',
  checkPermission('appointments', 'read'),
  asyncHandler(async (req, res) => {
    const items = await appointmentService.listAppointments(req.tenantId, {
      created_for: req.query.created_for as string | undefined,
      counselor_id: req.query.counselor_id as string | undefined,
      psychologist_id: req.query.psychologist_id as string | undefined,
      status: req.query.status as string | undefined,
      type: req.query.type as 'student' | 'personal' | undefined,
    });
    sendSuccess(res, items);
  }),
);

router.get(
  '/appointments/:appointmentId',
  checkPermission('appointments', 'read'),
  asyncHandler(async (req, res) => {
    const item = await appointmentService.getAppointment(req.tenantId, req.params.appointmentId);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.post(
  '/appointments',
  checkPermission('appointments', 'create'),
  asyncHandler(async (req, res) => {
    const item = await appointmentService.createAppointment(req.tenantId, {
      ...req.body,
      created_by: req.userId,
    });
    sendCreated(res, item);
  }),
);

// Personal staff appointment
router.post(
  '/appointments/personal',
  checkPermission('appointments', 'create'),
  asyncHandler(async (req, res) => {
    const body = createPersonalSchema.parse(req.body);
    const result = await appointmentService.createPersonalAppointment(req.tenantId, {
      ...body,
      actor_id: req.userId!,
    });
    sendCreated(res, result);
  }),
);

router.patch(
  '/appointments/:appointmentId/status',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body as { status: string; notes?: string };
    const item = await appointmentService.updateAppointmentStatus(req.tenantId, req.params.appointmentId, status, req.userId, notes);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.post(
  '/appointments/:appointmentId/confirm',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const { scheduled_at } = req.body as { scheduled_at: string };
    const item = await appointmentService.confirmAppointment(req.tenantId, req.params.appointmentId, scheduled_at, req.userId);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.patch(
  '/appointments/:appointmentId/notes',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const { notes } = req.body as { notes: string };
    const item = await appointmentService.updateAppointmentNotes(req.tenantId, req.params.appointmentId, req.userId, notes);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.patch(
  '/appointments/:appointmentId/mediate',
  checkPermission('appointments', 'update'),
  asyncHandler(async (req, res) => {
    const body = mediateSchema.parse(req.body);
    const item = await appointmentService.mediateAppointment(req.tenantId, req.params.appointmentId, req.userId, body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.get(
  '/appointments/counselors',
  checkPermission('appointments', 'read'),
  asyncHandler(async (req, res) => {
    const { rows } = await (require('../db/pool').queryWithTenant as any)(
      req.tenantId,
      `SELECT user_id, full_name, gender FROM users WHERE role = 'COUNSELOR' AND is_active = true ORDER BY full_name ASC`,
    );
    sendSuccess(res, rows);
  }),
);

export default router;
