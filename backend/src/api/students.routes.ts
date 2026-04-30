import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as timelineService from '../services/timeline.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

// ─── Validation ──────────────────────────────────────────────────────────────

const timelineQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  phase: z.string().optional(),
  type: z.enum(['INCIDENT', 'INTERVENTION', 'OBSERVATION', 'CASE_STATUS_CHANGE']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

// ─── GET /api/students/:studentId/timeline ───────────────────────────────────

router.get(
  '/:studentId/timeline',
  checkPermission('students', 'read'),
  asyncHandler(async (req, res) => {
    const query = timelineQuerySchema.parse(req.query);
    const anonymize = (req as unknown as Record<string, unknown>)['abacAnonymize'] === true;

    const { events, total } = await timelineService.getStudentTimeline(
      req.tenantId,
      String(req.params['studentId']),
      { ...query, anonymize },
    );

    sendSuccess(res, events, {
      page: query.page,
      limit: query.limit,
      total,
      hasMore: query.page * query.limit < total,
    });
  }),
);

export default router;
