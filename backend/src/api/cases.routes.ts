import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as casesService from '../services/cases.service.js';
import * as caseSharesService from '../services/case-shares.service.js';
import { getCaseCounseling, submitCaseCounseling } from '../services/counseling.service.js';
import { listAssetsForCase } from '../services/media.service.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';

const router = Router();

// Apply auth + tenant middleware to all routes
router.use(authenticate, setTenantContext);

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createCaseSchema = z.object({
  student_id: z.string().uuid(),
  case_type: z.enum(['BEHAVIORAL', 'EMOTIONAL', 'MEDICAL', 'ACADEMIC', 'POSITIVE']),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assigned_counselor: z.string().uuid().optional(),
  summary: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateCaseSchema = z.object({
  status: z.enum(['OPEN', 'MONITORING', 'CLOSED']).optional(),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  risk_level_source: z.enum(['MANUAL', 'AUTO']).optional(),
  assigned_counselor: z.string().uuid().nullable().optional(),
  summary: z.string().optional(),
  closed_date: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listCasesSchema = z.object({
  status: z.enum(['OPEN', 'MONITORING', 'CLOSED']).optional(),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  student_id: z.string().uuid().optional(),
  case_type: z.enum(['BEHAVIORAL', 'EMOTIONAL', 'MEDICAL', 'ACADEMIC', 'POSITIVE']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const shareCaseSchema = z.object({
  shared_with: z.array(z.string().uuid()).min(1).max(20),
  permission: z.enum(['VIEW', 'CONTRIBUTE']).optional(),
});

// ─── POST /api/cases ─────────────────────────────────────────────────────────

router.post(
  '/',
  checkPermission('cases', 'create'),
  asyncHandler(async (req, res) => {
    const body = createCaseSchema.parse(req.body);
    const created = await casesService.createCase(
      req.tenantId,
      body,
      req.userId,
      req,
    );
    sendCreated(res, created);
  }),
);

// ─── GET /api/cases ──────────────────────────────────────────────────────────

router.get(
  '/',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const query = listCasesSchema.parse(req.query);
    const medicalOnly = (req as unknown as Record<string, unknown>)['abacMedicalOnly'] === true;

    const { cases, total } = await casesService.listCases(req.tenantId, {
      ...query,
      medicalOnly,
    });

    sendPaginated(res, cases, total, query.page, query.limit);
  }),
);

// ─── POST /api/cases/:caseId/share ──────────────────────────────────────────

router.post(
  '/:caseId/share',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const body = shareCaseSchema.parse(req.body);
    const result = await caseSharesService.shareCase(
      req.tenantId,
      String(req.params['caseId']),
      body,
      req.userId,
      req,
    );
    sendCreated(res, result);
  }),
);

// ─── GET /api/cases/:caseId/shares ─────────────────────────────────────────

router.get(
  '/:caseId/shares',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const result = await caseSharesService.listCaseShares(
      req.tenantId,
      String(req.params['caseId']),
    );
    sendSuccess(res, result);
  }),
);

// ─── DELETE /api/cases/:caseId/share/:userId ───────────────────────────────

router.delete(
  '/:caseId/share/:userId',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    await caseSharesService.removeShare(
      req.tenantId,
      String(req.params['caseId']),
      String(req.params['userId']),
      req.userId,
      req,
    );
    sendSuccess(res, { message: 'Share removed successfully' });
  }),
);

// ─── GET /api/cases/:caseId/counseling ─────────────────────────────────────

const counselingSubmitSchema = z.object({
  answers: z.array(z.object({
    question_id: z.string().uuid(),
    answer_text: z.string(),
    score: z.number(),
  })),
  submitted_by: z.string().uuid(),
  student_id: z.string().uuid(),
  student_email: z.string().email().optional(),
  parent_email: z.string().email().optional(),
});

router.get(
  '/:caseId/counseling',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const submission = await getCaseCounseling(req.tenantId, String(req.params['caseId']));
    if (!submission) {
      sendSuccess(res, null);
      return;
    }
    sendSuccess(res, submission);
  }),
);

// ─── POST /api/cases/:caseId/counseling ────────────────────────────────────

router.post(
  '/:caseId/counseling',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const body = counselingSubmitSchema.parse(req.body);
    const submission = await submitCaseCounseling(req.tenantId, {
      caseId: String(req.params['caseId']),
      answers: body.answers,
      submitted_by: body.submitted_by,
      student_id: body.student_id,
    });
    sendCreated(res, submission);
  }),
);

// ─── GET /api/cases/:caseId/media ─────────────────────────────────────────

router.get(
  '/:caseId/media',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const assets = await listAssetsForCase(
      req.tenantId,
      String(req.params['caseId']),
      req.userId,
    );
    sendSuccess(res, assets);
  }),
);

// ─── GET /api/cases/:caseId ──────────────────────────────────────────────────

router.get(
  '/:caseId',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const caseRow = await casesService.getCaseById(req.tenantId, String(req.params['caseId']));

    // IT_ADMIN data minimization: redact descriptions
    if ((req as unknown as Record<string, unknown>)['abacRedactNarratives']) {
      caseRow.summary = '[REDACTED]';
    }

    sendSuccess(res, caseRow);
  }),
);

// ─── PATCH /api/cases/:caseId ────────────────────────────────────────────────

router.patch(
  '/:caseId',
  checkPermission('cases', 'update'),
  asyncHandler(async (req, res) => {
    const body = updateCaseSchema.parse(req.body);
    const updated = await casesService.updateCase(
      req.tenantId,
      String(req.params['caseId']),
      body,
      req.userId,
      req,
    );
    sendSuccess(res, updated);
  }),
);

// ─── DELETE /api/cases/:caseId ───────────────────────────────────────────────

router.delete(
  '/:caseId',
  checkPermission('cases', 'delete'),
  asyncHandler(async (req, res) => {
    await casesService.softDeleteCase(
      req.tenantId,
      String(req.params['caseId']),
      req.userId,
      req,
    );
    sendSuccess(res, { message: 'Case deleted successfully' });
  }),
);

export default router;
