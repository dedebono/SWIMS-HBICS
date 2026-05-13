import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as interventionsService from '../services/interventions.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const createInterventionSchema = z.object({
  incident_id: z.string().uuid().optional(),
  assigned_staff: z.array(z.string().uuid()).optional(),
  type: z.string().min(1),
  description: z.string().min(1),
  scheduled_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateInterventionSchema = z.object({
  assigned_staff: z.array(z.string().uuid()).optional(),
  type: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  scheduled_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  outcome: z.string().optional(),
  effectiveness: z.number().min(1).max(5).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── POST /api/cases/:caseId/interventions ───────────────────────────────────

router.post(
  '/cases/:caseId/interventions',
  checkPermission('interventions', 'create'),
  asyncHandler(async (req, res) => {
    const body = createInterventionSchema.parse(req.body);
    const created = await interventionsService.createIntervention(
      req.tenantId,
      String(req.params['caseId']),
      body,
      req.userId,
      req,
    );
    sendCreated(res, created);
  }),
);

// ─── GET /api/cases/:caseId/interventions ────────────────────────────────────

router.get(
  '/cases/:caseId/interventions',
  checkPermission('interventions', 'read'),
  asyncHandler(async (req, res) => {
    const interventions = await interventionsService.listInterventions(
      req.tenantId,
      String(req.params['caseId']),
    );
    sendSuccess(res, interventions);
  }),
);

// ─── PATCH /api/interventions/:interventionId ───────────────────────────────

router.patch(
  '/interventions/:interventionId',
  checkPermission('interventions', 'update'),
  asyncHandler(async (req, res) => {
    const body = updateInterventionSchema.parse(req.body);
    const updated = await interventionsService.updateIntervention(
      req.tenantId,
      String(req.params['interventionId']),
      body,
      req.userId,
      req,
    );
    sendSuccess(res, updated);
  }),
);

export default router;
