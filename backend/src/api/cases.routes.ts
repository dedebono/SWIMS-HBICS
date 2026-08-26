import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as casesService from '../services/cases.service.js';
import * as mediaService from '../services/media.service.js';
import * as quisionerService from '../services/quisioner.service.js';
import * as quisionerSettingsService from '../services/quisioner-settings.service.js';
import * as emailService from '../services/email.service.js';
import * as appointmentService from '../services/appointments.service.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';
import nodemailer from 'nodemailer';
import { getClientWithTenant } from '../db/pool.js';

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

    const teacherId = (req.userRole === 'TEACHER' || req.userRole === 'SUBSTITUTE_TEACHER') 
      ? req.userId 
      : undefined;

    const { cases, total } = await casesService.listCases(req.tenantId, {
      ...query,
      medicalOnly,
      teacher_id: teacherId,
    });

    sendPaginated(res, cases, total, query.page, query.limit);
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

// ─── GET /api/cases/:caseId/media ────────────────────────────────────────────

router.get(
  '/:caseId/media',
  checkPermission('media_assets', 'read'),
  asyncHandler(async (req, res) => {
    const assets = await mediaService.listAssetsForCase(
      req.tenantId,
      String(req.params['caseId']),
    );
    sendSuccess(res, assets);
  }),
);

// ─── POST /api/cases/:caseId/counseling ──────────────────────────────────────

router.post(
  '/:caseId/counseling',
  checkPermission('quisioner', 'create'),
  asyncHandler(async (req, res) => {
    const body = z.object({
      answers: z.array(z.object({
        question_id: z.string().uuid(),
        answer_text: z.string().optional(),
        score: z.number().int().min(0).max(10),
      })),
    }).parse(req.body);

    const submission = await quisionerService.submitCounselingAnswers(
      req.tenantId,
      {
        case_id: String(req.params['caseId']),
        answers: body.answers,
        submitted_by: req.userId!,
        student_id: String(req.body.student_id),
        student_email: req.body.student_email,
        parent_email: req.body.parent_email,
      },
    );

    const threshold = await quisionerSettingsService.getThreshold(req.tenantId);
    if (submission.score < threshold) {
      submission.recommendation = 'internal';
    } else {
      submission.recommendation = 'professional';
    }

    let appointmentId: string | null = null;
    if (submission.recommendation === 'professional') {
      try {
        const appt = await appointmentService.createAppointment(req.tenantId, {
          type: 'student',
          created_by: req.userId!,
          created_for: String(req.body.student_id),
          student_id: String(req.body.student_id),
          psychologist_id: null,
          notes: 'Menunggu psikolog mengisi ketersediaan jadwal.',
          metadata: { case_id: String(req.params['caseId']), recommendation: submission.recommendation },
        });
        appointmentId = appt.appointment_id;
      } catch (e) {
        console.warn('Failed to create appointment for professional recommendation', e);
      }
    }

    // Best-effort email notification to parent
    try {
      const settings = await emailService.getTenantEmailSettings(req.tenantId);
      if (settings && req.body.parent_email) {
        const transporter = nodemailer.createTransport({
          host: settings.host,
          port: settings.port,
          secure: settings.secure,
          auth: settings.username && settings.password ? {
            user: settings.username,
            pass: settings.password,
          } : undefined,
        });
        await transporter.sendMail({
          from: settings.username,
          to: req.body.parent_email,
          subject: 'SWIMS-HBICS: Notifikasi Kebutuhan Konseling',
          text: `Yth. Orang Tua/Wali,\n\nGuru telah mengisi quisioner bantuan profesional untuk siswa dan sistem merekomendasikan: ${submission.recommendation}.\n\nHubungi sekolah untuk informasi lebih lanjut.${appointmentId ? `\n\nID Janji Temu: ${appointmentId}` : ''}`,
        });
      }
    } catch (e) {
      console.warn('Email notification failed', e);
    }

    sendCreated(res, { ...submission, appointmentId });
  }),
);

router.get(
  '/:caseId/counseling',
  checkPermission('quisioner', 'read'),
  asyncHandler(async (req, res) => {
    const { rows } = await (async () => {
      const client = await getClientWithTenant(req.tenantId);
      try {
        const r = await client.query(`SELECT * FROM counseling_submissions WHERE case_id = $1 ORDER BY submitted_at DESC LIMIT 1`, [String(req.params['caseId'])]);
        return r;
      } finally {
        client.release();
      }
    })();
    sendSuccess(res, rows[0] ?? null);
  }),
);

export default router;
