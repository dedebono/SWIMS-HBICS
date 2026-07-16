import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as incidentsService from '../services/incidents.service.js';
import { validateNeutralLanguage } from '../utils/language-check.service.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

// ─── Validation Schemas ──────────────────────────────────────────────────────

const witnessSchema = z.object({
  user_id: z.string().uuid().optional(),
  name: z.string(),
  statement: z.string().optional(),
});

const createIncidentSchema = z.object({
  student_id: z.string().uuid(),
  involved_teacher: z.string().uuid().nullable().optional(),
  category: z.string().min(1),
  sub_category: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string().min(1),
  location: z.string().optional(),
  student_grade: z.string().max(50).optional(),
  incident_at: z.string().datetime(),
  witnesses: z.array(witnessSchema).optional(),
  immediate_actions: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateIncidentSchema = z.object({
  involved_teacher: z.string().uuid().nullable().optional(),
  category: z.string().min(1).optional(),
  sub_category: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  description: z.string().min(1).optional(),
  location: z.string().optional(),
  student_grade: z.string().max(50).optional(),
  incident_at: z.string().datetime().optional(),
  witnesses: z.array(witnessSchema).optional(),
  immediate_actions: z.string().optional(),
  language_flag: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listIncidentsSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ─── GET /api/incidents/my-reports ───────────────────────────────────────────
// Returns all incidents reported by the currently authenticated user,
// including the student name/ID for each incident.

router.get(
  '/incidents/my-reports',
  checkPermission('incidents', 'read'),
  asyncHandler(async (req, res) => {
    const query = listIncidentsSchema.parse(req.query);
    const { incidents, total } = await incidentsService.listIncidents(req.tenantId, {
      ...query,
      reported_by: req.userId,   // ← scoped to this teacher's reports
    });
    sendPaginated(res, incidents, total, query.page, query.limit);
  }),
);

// ─── GET /api/incidents/my-students ──────────────────────────────────────────
// Returns distinct students from incidents reported by the logged-in user.

router.get(
  '/incidents/my-students',
  checkPermission('incidents', 'read'),
  asyncHandler(async (req, res) => {
    const students = await incidentsService.getMyStudents(req.tenantId, req.userId);
    sendSuccess(res, students);
  }),
);

// ─── POST /api/cases/:caseId/incidents ───────────────────────────────────────

router.post(
  '/cases/:caseId/incidents',
  checkPermission('incidents', 'create'),
  asyncHandler(async (req, res) => {
    const body = createIncidentSchema.parse(req.body);

    const langCheck = validateNeutralLanguage(req.tenantId, body.description);
    if (!langCheck.passed) {
      // 400 Bad Request with suggestions
      res.status(400).json({
        success: false,
        error: {
          code: 'LANGUAGE_BLOCKLIST_FLAGGED',
          message: 'The incident description contains blocked or stigmatizing terminology. Please revise to use neutral language.',
          details: {
            flaggedTerms: langCheck.flaggedList
          }
        }
      });
      return;
    }

    const created = await incidentsService.createIncident(
      req.tenantId,
      {
        ...body,
        case_id: String(req.params['caseId']),
      },
      req.userId,
      req,
    );
    sendCreated(res, created);
  }),
);

// ─── GET /api/cases/:caseId/incidents ────────────────────────────────────────

router.get(
  '/cases/:caseId/incidents',
  checkPermission('incidents', 'read'),
  asyncHandler(async (req, res) => {
    const query = listIncidentsSchema.parse(req.query);
    const medicalOnly = (req as unknown as Record<string, unknown>)['abacMedicalOnly'] === true;

    const { incidents, total } = await incidentsService.listIncidents(req.tenantId, {
      case_id: String(req.params['caseId']),
      ...query,
      medicalOnly,
    });

    // IT_ADMIN: redact narratives
    if ((req as unknown as Record<string, unknown>)['abacRedactNarratives']) {
      for (const incident of incidents) {
        incident.description = '[REDACTED]';
        incident.immediate_actions = null;
      }
    }

    sendPaginated(res, incidents, total, query.page, query.limit);
  }),
);

// ─── GET /api/incidents/:incidentId ──────────────────────────────────────────

router.get(
  '/incidents/:incidentId',
  checkPermission('incidents', 'read'),
  asyncHandler(async (req, res) => {
    const incident = await incidentsService.getIncidentById(
      req.tenantId,
      String(req.params['incidentId']),
    );

    if ((req as unknown as Record<string, unknown>)['abacRedactNarratives']) {
      incident.description = '[REDACTED]';
      incident.immediate_actions = null;
    }

    sendSuccess(res, incident);
  }),
);

// ─── PATCH /api/incidents/:incidentId ────────────────────────────────────────

router.patch(
  '/incidents/:incidentId',
  checkPermission('incidents', 'update'),
  asyncHandler(async (req, res) => {
    const body = updateIncidentSchema.parse(req.body);
    const updated = await incidentsService.updateIncident(
      req.tenantId,
      String(req.params['incidentId']),
      body,
      req.userId,
      req,
    );
    sendSuccess(res, updated);
  }),
);

// ─── DELETE /api/incidents/:incidentId ───────────────────────────────────────

router.delete(
  '/incidents/:incidentId',
  checkPermission('incidents', 'delete'),
  asyncHandler(async (req, res) => {
    await incidentsService.softDeleteIncident(
      req.tenantId,
      String(req.params['incidentId']),
      req.userId,
      req,
    );
    sendSuccess(res, { message: 'Incident deleted successfully' });
  }),
);

export default router;
