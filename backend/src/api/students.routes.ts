import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as timelineService from '../services/timeline.service.js';
import * as studentsService from '../services/students.service.js';
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

const searchQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().min(1).max(20).default(10),
});

// ─── GET /api/students/search ────────────────────────────────────────────────

router.get(
  '/search',
  checkPermission('students', 'read'),
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);
    const results = await studentsService.searchStudents(req.tenantId, query.q, query.limit);
    sendSuccess(res, results);
  }),
);

// ─── GET /api/students/:studentId ──────────────────────────────────────────────

router.get(
  '/:studentId',
  checkPermission('students', 'read'),
  asyncHandler(async (req, res) => {
    const student = await studentsService.getStudentById(req.tenantId, String(req.params['studentId']));
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    sendSuccess(res, student);
  }),
);

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
