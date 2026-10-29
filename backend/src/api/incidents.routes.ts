import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as incidentsService from '../services/incidents.service.js';
import { assertCaseVisible, assertIncidentVisible, type CaseViewer } from '../services/case-visibility.service.js';
import { validateNeutralLanguage } from '../utils/language-check.service.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

/**
 * ABAC guard: a teacher-scoped viewer may only touch incidents of cases they
 * created, reported an incident on, or that were shared with them.
 */
function guardCaseAccess(req: { tenantId?: string; userId?: string; userRole?: string }, caseId: string) {
  return assertCaseVisible(req.tenantId!, caseId, {
    userId: req.userId!,
    role: req.userRole!,
  } satisfies CaseViewer);
}

function guardIncidentAccess(req: { tenantId?: string; userId?: string; userRole?: string }, incidentId: string) {
  return assertIncidentVisible(req.tenantId!, incidentId, {
    userId: req.userId!,
    role: req.userRole!,
  } satisfies CaseViewer);
}

// ─── Validation Schemas ──────────────────────────────────────────────────────

const witnessSchema = z.object({
  user_id: z.string().uuid().optional(),
  name: z.string(),
  statement: z.string().optional(),
});

const createIncidentSchema = z.object({
  student_id: z.string().uuid(),
  category: z.string().min(1),
  sub_category: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string().min(1),
  location: z.string().optional(),
  incident_at: z.string().datetime(),
  witnesses: z.array(witnessSchema).optional(),
  immediate_actions: z.string().optional(),
});

const updateIncidentSchema = z.object({
  category: z.string().min(1).optional(),
  sub_category: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  description: z.string().min(1).optional(),
  location: z.string().optional(),
  incident_at: z.string().datetime().optional(),
  witnesses: z.array(witnessSchema).optional(),
  immediate_actions: z.string().optional(),
  language_flag: z.boolean().optional(),
});

const listIncidentsSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ─── GET /api/incidents/my-reports ────────────────────────────────────────────
// Incidents reported by the current teacher user
router.get(
  '/my-reports',
  checkPermission('incidents', 'read'),
  asyncHandler(async (req, res) => {
    const limit = Number(req.query['limit']) || 50;
    const incidents = await incidentsService.listIncidentsByReporter(
      req.tenantId,
      req.userId,
      limit,
    );
    sendSuccess(res, incidents);
  }),
);

// ─── GET /api/incidents/my-students ───────────────────────────────────────────
// Students who have incidents reported by the current teacher user
router.get(
  '/my-students',
  checkPermission('incidents', 'read'),
  asyncHandler(async (req, res) => {
    const students = await incidentsService.listStudentsByReporter(
      req.tenantId,
      req.userId,
    );
    sendSuccess(res, students);
  }),
);

// ─── ALIASES: /api/incidents/my-reports & /api/incidents/my-students ─────────
// This router is mounted at '/api', so these were previously swallowed by
// GET /incidents/:incidentId (incidentId='my-reports'). Register the static
// paths BEFORE the param routes so both spellings work.
router.get(
  '/incidents/my-reports',
  checkPermission('incidents', 'read'),
  asyncHandler(async (req, res) => {
    const limit = Number(req.query['limit']) || 50;
    const incidents = await incidentsService.listIncidentsByReporter(
      req.tenantId,
      req.userId,
      limit,
    );
    sendSuccess(res, incidents);
  }),
);

router.get(
  '/incidents/my-students',
  checkPermission('incidents', 'read'),
  asyncHandler(async (req, res) => {
    const students = await incidentsService.listStudentsByReporter(
      req.tenantId,
      req.userId,
    );
    sendSuccess(res, students);
  }),
);

// ─── POST /api/cases/:caseId/incidents ───────────────────────────────────────

router.post(
  '/cases/:caseId/incidents',
  checkPermission('incidents', 'create'),
  asyncHandler(async (req, res) => {
    await guardCaseAccess(req, String(req.params['caseId']));
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
    await guardCaseAccess(req, String(req.params['caseId']));
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
    await guardIncidentAccess(req, String(req.params['incidentId']));
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
    await guardIncidentAccess(req, String(req.params['incidentId']));
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
    await guardIncidentAccess(req, String(req.params['incidentId']));
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
