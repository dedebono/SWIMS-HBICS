import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as availabilityService from '../services/availability.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSlotSchema = z.object({
  slot_start: z.string(),
  slot_end: z.string(),
  is_available: z.boolean().optional().default(true),
  // Recurring options
  repeat_pattern: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
  repeat_day: z.number().int().min(0).max(6).optional(),  // 0=Sun..6=Sat
  repeat_weeks: z.number().int().min(1).max(4).optional(),  // every N weeks (1|2|3|4)
  repeat_count: z.number().int().min(1).max(52).optional().default(8),
});

const updateSlotSchema = z.object({
  slot_start: z.string().optional(),
  slot_end: z.string().optional(),
  is_available: z.boolean().optional(),
  appointment_id: z.union([z.string(), z.null()]).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /:professionalId — list slots for a professional
router.get(
  '/:professionalId',
  checkPermission('availability', 'read'),
  asyncHandler(async (req, res) => {
    const items = await availabilityService.listAvailability(
      req.tenantId,
      req.params.professionalId,
    );
    sendSuccess(res, items);
  }),
);

// POST /availability — create single or recurring slot(s)
router.post(
  '/',
  checkPermission('availability', 'create'),
  asyncHandler(async (req, res) => {
    const body = createSlotSchema.parse(req.body);
    const professionalId = req.userId!;

    // If recurring, generate multiple slots
    if (body.repeat_pattern) {
      const slots = await availabilityService.createRecurringSlots(req.tenantId, {
        professional_id: professionalId,
        slot_start: body.slot_start,
        slot_end: body.slot_end,
        is_available: body.is_available,
        repeat_pattern: body.repeat_pattern,
        repeat_day: body.repeat_day,
        repeat_weeks: body.repeat_weeks,
        repeat_count: body.repeat_count,
      });
      sendCreated(res, slots);
      return;
    }

    // Single slot
    const slot = await availabilityService.createAvailabilitySlot(req.tenantId, {
      professional_id: professionalId,
      slot_start: body.slot_start,
      slot_end: body.slot_end,
      is_available: body.is_available,
    });
    sendCreated(res, slot);
  }),
);

// PATCH /availability/:slotId — update a slot
router.patch(
  '/:slotId',
  checkPermission('availability', 'update'),
  asyncHandler(async (req, res): Promise<void> => {
    const body = updateSlotSchema.parse(req.body);
    const item = await availabilityService.updateAvailabilitySlot(
      req.tenantId,
      req.params.slotId as string,
      body,
    );
    if (!item) { res.status(404).json({ message: 'Slot not found' }); return; }
    sendSuccess(res, item);
  }),
);

// DELETE /:slotId — soft-delete a slot
router.delete(
  '/:slotId',
  checkPermission('availability', 'delete'),
  asyncHandler(async (req, res): Promise<void> => {
    const deleted = await availabilityService.deleteAvailabilitySlot(
      req.tenantId,
      req.params.slotId as string,
    );
    if (!deleted) { res.status(404).json({ message: 'Slot not found' }); return; }
    sendSuccess(res, { deleted: true });
  }),
);

export default router;
