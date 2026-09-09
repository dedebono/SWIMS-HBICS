import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext, setTenantFromSlug } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';
import * as ecService from '../services/employee-counseling.service.js';
import {
  EmployeeCounselingSubmissionSchema,
  CreateSessionNoteSchema,
  CloseSubmissionSchema,
  AssignCounselorSchema,
} from '@swims/shared';
import type { Role } from '@swims/shared';

const router = Router();

// ── PUBLIC: Staff submit intake (no auth required, tenant identified by slug) ─
router.post('/employee-counseling/submit', setTenantFromSlug, asyncHandler(async (req, res) => {
  const parsed = EmployeeCounselingSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ message: 'Validation error', errors: parsed.error.flatten() });
  }
  const tenantId = (req as any).tenantId;
  // submittedBy = userId from auth header if present, otherwise null (anonymous)
  const submittedBy = (req as any).userId ?? null;
  const submission = await ecService.submitIntake(tenantId, parsed.data, submittedBy);
  sendCreated(res, submission);
}));

// ── PROTECTED: List submissions ─────────────────────────────────────────────
router.get('/employee-counseling/submissions', authenticate, setTenantContext, asyncHandler(async (req, res) => {
  const role = (req as any).user.role as Role;
  const userId = (req as any).userId;
  const tenantId = req.tenantId!;

  const filters: Parameters<typeof ecService.listSubmissions>[1] = {};
  if (typeof req.query.status === 'string') filters.status = req.query.status as any;
  if (req.query.is_high_priority === 'true') filters.is_high_priority = true;
  if (req.query.my_assignments === 'true' && (role === 'COUNSELOR' || role === 'PSYCHOLOGIST')) {
    filters.assigned_counselor_id = userId;
  }

  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 100);
  const offset = parseInt(String(req.query.offset ?? '0'), 10);
  const page = Math.floor(offset / limit) + 1;

  const result = await ecService.listSubmissions(tenantId, filters, userId, role, limit, offset);
  sendPaginated(res, result.submissions, result.total, page, limit);
}));

// ── PROTECTED: Get single submission ────────────────────────────────────────
router.get('/employee-counseling/submissions/:id', authenticate, setTenantContext, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const userId = (req as any).userId;
  const role = (req as any).user.role as Role;
  const submission = await ecService.getSubmission(tenantId, req.params.id);

  if (!submission) return res.status(404).json({ message: 'Not found' });

  // RBAC: employees see only their own submissions
  const viewerRoles: Role[] = ['COUNSELOR', 'PSYCHOLOGIST', 'IT_ADMIN', 'SCHOOL_HEAD'];
  if (!viewerRoles.includes(role) && submission.submitted_by !== userId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Log access (confidentiality requirement)
  await ecService.logAccess(tenantId, req.params.id, userId, 'Viewed submission');

  sendSuccess(res, submission);
}));

// ── PROTECTED: Assign counselor ──────────────────────────────────────────────
router.patch('/employee-counseling/submissions/:id/assign', authenticate, setTenantContext, checkPermission('employee_counseling', 'update'), asyncHandler(async (req, res) => {
  const parsed = AssignCounselorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: 'Validation error' });

  const updated = await ecService.assignCounselor(
    req.tenantId!,
    req.params.id,
    parsed.data,
    (req as any).userId,
  );
  if (!updated) return res.status(404).json({ message: 'Not found' });
  sendSuccess(res, updated);
}));

// ── PROTECTED: Create session note ──────────────────────────────────────────
router.post('/employee-counseling/sessions', authenticate, setTenantContext, checkPermission('employee_counseling', 'create'), asyncHandler(async (req, res) => {
  const parsed = CreateSessionNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: 'Validation error', errors: parsed.error.flatten() });

  const session = await ecService.createSession(req.tenantId!, parsed.data, (req as any).userId);
  sendCreated(res, session);
}));

// ── PROTECTED: Update session note ──────────────────────────────────────────
router.patch('/employee-counseling/sessions/:id', authenticate, setTenantContext, checkPermission('employee_counseling', 'update'), asyncHandler(async (req, res) => {
  const parsed = CreateSessionNoteSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: 'Validation error' });

  const updated = await ecService.updateSession(req.tenantId!, req.params.id, parsed.data, (req as any).userId);
  if (!updated) return res.status(404).json({ message: 'Not found' });
  sendSuccess(res, updated);
}));

// ── PROTECTED: List sessions for a submission ────────────────────────────────
router.get('/employee-counseling/submissions/:id/sessions', authenticate, setTenantContext, checkPermission('employee_counseling', 'read'), asyncHandler(async (req, res) => {
  const sessions = await ecService.listSessions(req.tenantId!, req.params.id);
  sendSuccess(res, sessions);
}));

// ── PROTECTED: Close submission ─────────────────────────────────────────────
router.patch('/employee-counseling/submissions/:id/close', authenticate, setTenantContext, checkPermission('employee_counseling', 'update'), asyncHandler(async (req, res) => {
  const parsed = CloseSubmissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: 'Validation error' });

  const updated = await ecService.closeSubmission(req.tenantId!, req.params.id, parsed.data, (req as any).userId);
  if (!updated) return res.status(404).json({ message: 'Not found' });
  sendSuccess(res, updated);
}));

// ── PROTECTED: Access log (admin only) ─────────────────────────────────────
router.get('/employee-counseling/submissions/:id/access-log', authenticate, setTenantContext, checkPermission('employee_counseling', 'read'), asyncHandler(async (req, res) => {
  const role = (req as any).user.role as Role;
  if (role !== 'IT_ADMIN') return res.status(403).json({ message: 'Admin only' });

  const log = await ecService.getAccessLog(req.tenantId!, req.params.id);
  sendSuccess(res, log);
}));

export default router;
