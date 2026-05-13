import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as observationsService from '../services/positive-observations.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const createObservationSchema = z.object({
  student_id: z.string().uuid(),
  case_id: z.string().uuid().optional(),
  category: z.string().min(1),
  description: z.string().min(1),
  observed_at: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── POST /api/students/:studentId/observations ──────────────────────────────

router.post(
  '/students/:studentId/observations',
  checkPermission('positive_observations', 'create'),
  asyncHandler(async (req, res) => {
    const body = createObservationSchema.parse({
      ...req.body,
      student_id: req.params['studentId'] // ensure sync
    });
    const created = await observationsService.createObservation(
      req.tenantId,
      body,
      req.userId,
      req,
    );
    sendCreated(res, created);
  }),
);

// ─── GET /api/students/:studentId/observations ───────────────────────────────

router.get(
  '/students/:studentId/observations',
  checkPermission('positive_observations', 'read'),
  asyncHandler(async (req, res) => {
    const observations = await observationsService.listObservationsByStudent(
      req.tenantId,
      String(req.params['studentId']),
    );
    sendSuccess(res, observations);
  }),
);

export default router;
