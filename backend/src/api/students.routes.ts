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
    const studentIdParam = req.params['studentId'];
    if (!studentIdParam) {
      res.status(404).json({ success: false, error: 'Student not found' });
      return;
    }

    const student = await studentsService.getStudentById(req.tenantId, String(studentIdParam));
    if (!student) {
      res.status(404).json({ success: false, error: 'Student not found' });
      return;
    }
    sendSuccess(res, student);
  }),
);

// ─── GET /api/students/:studentId/timeline ───────────────────────────────────

router.get(
  '/:studentId/timeline',
  checkPermission('students', 'read'),
  asyncHandler(async (req, res) => {
    const studentIdParam = req.params['studentId'];
    if (!studentIdParam) {
      res.status(404).json({ success: false, error: 'Student not found' });
      return;
    }

    const query = timelineQuerySchema.parse(req.query);
    const anonymize = (req as unknown as Record<string, unknown>)['abacAnonymize'] === true;

    const { events, total } = await timelineService.getStudentTimeline(
      req.tenantId,
      String(studentIdParam),
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

// ─── GET /api/students/:studentId/progress ──────────────────────────────────

router.get(
  '/:studentId/progress',
  checkPermission('students', 'read'),
  asyncHandler(async (req, res) => {
    const studentIdParam = req.params['studentId'];
    if (!studentIdParam) {
      res.status(404).json({ success: false, error: 'Student not found' });
      return;
    }

    const progress = await timelineService.getStudentProgress(
      req.tenantId,
      String(studentIdParam),
    );
    sendSuccess(res, progress);
  }),
);

// ─── GET /api/students/:studentId/profile ───────────────────────────────────

router.get(
  '/:studentId/profile',
  checkPermission('students', 'read'),
  asyncHandler(async (req, res) => {
    const studentIdParam = req.params['studentId'];
    if (!studentIdParam) {
      res.status(404).json({ success: false, error: 'Student not found' });
      return;
    }

    const profile = await timelineService.getStudentProfile(
      req.tenantId,
      String(studentIdParam),
    );
    if (!profile) {
      res.status(404).json({ success: false, error: 'Student not found' });
      return;
    }
    sendSuccess(res, profile);
  }),
);

// ─── GET /api/students/:studentId/cases ─────────────────────────────────────

router.get(
  '/:studentId/cases',
  checkPermission('students', 'read'),
  asyncHandler(async (req, res) => {
    const studentIdParam = req.params['studentId'];
    if (!studentIdParam) {
      res.status(404).json({ success: false, error: 'Student not found' });
      return;
    }

    const cases = await timelineService.getStudentCases(
      req.tenantId,
      String(studentIdParam),
    );
    sendSuccess(res, cases);
  }),
);

export default router;
