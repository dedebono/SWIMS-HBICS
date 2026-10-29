import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool } from '../../db/pool.js';

// Mock ALL service modules the route file imports, BEFORE app is imported
vi.mock('../../services/incidents.service.js', () => ({
  createIncident: vi.fn(),
  listIncidents: vi.fn(),
  getIncidentById: vi.fn(),
  updateIncident: vi.fn(),
  softDeleteIncident: vi.fn(),
  listIncidentsByReporter: vi.fn(),
  listStudentsByReporter: vi.fn(),
}));

vi.mock('../../services/case-visibility.service.js', () => ({
  assertCaseVisible: vi.fn(),
  assertIncidentVisible: vi.fn(),
}));

vi.mock('../../utils/language-check.service.js', () => ({
  validateNeutralLanguage: vi.fn(),
}));

import {
  createIncident,
  listIncidents,
  getIncidentById,
  updateIncident,
  softDeleteIncident,
  listIncidentsByReporter,
  listStudentsByReporter,
} from '../../services/incidents.service.js';
import {
  assertCaseVisible,
  assertIncidentVisible,
} from '../../services/case-visibility.service.js';
import { validateNeutralLanguage } from '../../utils/language-check.service.js';

// NOTE: index.ts mounts this router at `/api` (NOT `/api/incidents`), so the
// reporter-scoped routes live at `/api/my-reports` and `/api/my-students`.
// FIXED (2026-10-29): `/api/incidents/my-reports` and `/api/incidents/my-students`
// used to be swallowed by `GET /incidents/:incidentId`; static alias routes now
// handle them, so both spellings work.
const MY_REPORTS_URL = '/api/my-reports';
const MY_STUDENTS_URL = '/api/my-students';

const TENANT = 'tenant-123';
const CASE_ID = '123e4567-e89b-12d3-a456-426614174010';
const INCIDENT_ID = '123e4567-e89b-12d3-a456-426614174020';
const STUDENT_ID = '123e4567-e89b-12d3-a456-426614174030';

const VALID_INCIDENT_BODY = {
  student_id: STUDENT_ID,
  category: 'Bullying',
  severity: 'MEDIUM',
  description: 'Student pushed another student during recess.',
  incident_at: '2025-01-15T10:30:00.000Z',
};

describe('Incidents Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // ABAC guards pass by default
    (assertCaseVisible as any).mockResolvedValue(undefined);
    (assertIncidentVisible as any).mockResolvedValue(undefined);

    // Neutral-language check passes by default. The route treats the return
    // value SYNCHRONOUSLY (no await), so this must be mockReturnValue, not
    // mockResolvedValue — a promise would make `langCheck.passed` undefined
    // and every create would 400 as LANGUAGE_BLOCKLIST_FLAGGED.
    (validateNeutralLanguage as any).mockReturnValue({
      passed: true,
      flaggedList: [],
    });

    // Mock tenant validation for setTenantContext middleware (insights pattern).
    // Any other query (e.g. the dynamic permission matrix) returns no rows so
    // checkPermission falls back to the static PERMISSIONS matrix.
    (pool.query as any).mockImplementation((queryStr: string) => {
      if (queryStr.includes('SELECT tenant_id')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: TENANT }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  // ─── GET /api/incidents/my-reports ──────────────────────────────────────────

  describe('GET /api/incidents/my-reports', () => {
    it('should list incidents reported by the current user', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      const mockIncidents = [{ incident_id: INCIDENT_ID, category: 'Bullying' }];
      (listIncidentsByReporter as any).mockResolvedValue(mockIncidents);

      const res = await request(app)
        .get(MY_REPORTS_URL)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockIncidents);
      expect(listIncidentsByReporter).toHaveBeenCalledWith(TENANT, 'user-123', 50);
    });

    it('should require authentication', async () => {
      const res = await request(app).get(MY_REPORTS_URL);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should 403 for a role without incidents:read (STUDENT)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'STUDENT');

      const res = await request(app)
        .get(MY_REPORTS_URL)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    // FIXED (2026-10-29): the alias path used to be swallowed by
    // GET /incidents/:incidentId (:incidentId='my-reports').
    it('serves the same reports on the /api/incidents/my-reports alias', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      const mockIncidents = [{ incident_id: INCIDENT_ID, category: 'Bullying' }];
      (listIncidentsByReporter as any).mockResolvedValue(mockIncidents);

      const res = await request(app)
        .get('/api/incidents/my-reports?limit=25')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockIncidents);
      expect(listIncidentsByReporter).toHaveBeenCalledWith(TENANT, 'user-123', 25);
    });
  });

  // ─── GET /api/incidents/my-students ─────────────────────────────────────────

  describe('GET /api/incidents/my-students', () => {
    it('should list students from incidents reported by the current user', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      const mockStudents = [{ student_id: STUDENT_ID, name: 'Budi' }];
      (listStudentsByReporter as any).mockResolvedValue(mockStudents);

      const res = await request(app)
        .get(MY_STUDENTS_URL)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStudents);
      expect(listStudentsByReporter).toHaveBeenCalledWith(TENANT, 'user-123');
    });

    it('should require authentication', async () => {
      const res = await request(app).get(MY_STUDENTS_URL);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── POST /api/cases/:caseId/incidents ──────────────────────────────────────

  describe('POST /api/cases/:caseId/incidents', () => {
    it('should create an incident and return 201 with the created record', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      const created = { incident_id: INCIDENT_ID, case_id: CASE_ID };
      (createIncident as any).mockResolvedValue(created);

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/incidents`)
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_INCIDENT_BODY);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('incident_id', INCIDENT_ID);
    });

    it('should pass the case_id from the URL and the reporter user to the service', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      (createIncident as any).mockResolvedValue({ incident_id: INCIDENT_ID });

      await request(app)
        .post(`/api/cases/${CASE_ID}/incidents`)
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_INCIDENT_BODY);

      const [tenantId, body, userId] = (createIncident as any).mock.calls[0];
      expect(tenantId).toBe(TENANT);
      expect(body.case_id).toBe(CASE_ID);
      expect(body.student_id).toBe(STUDENT_ID);
      expect(userId).toBe('user-123');
    });

    it('should reject descriptions containing blocked terminology with 400', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      (validateNeutralLanguage as any).mockReturnValue({
        passed: false,
        flaggedList: ['stupid'],
      });

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/incidents`)
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_INCIDENT_BODY);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('LANGUAGE_BLOCKLIST_FLAGGED');
      expect(res.body.error.details.flaggedTerms).toEqual(['stupid']);
      expect(createIncident).not.toHaveBeenCalled();
    });

    it('should validate required fields (missing severity)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');

      const { severity, ...withoutSeverity } = VALID_INCIDENT_BODY;

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/incidents`)
        .set('Authorization', `Bearer ${token}`)
        .send(withoutSeverity);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(createIncident).not.toHaveBeenCalled();
    });

    it('should validate severity enum values', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/incidents`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_INCIDENT_BODY, severity: 'EXTREME' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require incidents:create permission (STUDENT → 403)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'STUDENT');

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/incidents`)
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_INCIDENT_BODY);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/incidents`)
        .send(VALID_INCIDENT_BODY);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── GET /api/cases/:caseId/incidents ───────────────────────────────────────

  describe('GET /api/cases/:caseId/incidents', () => {
    const mockList = [
      { incident_id: 'inc-1', description: 'Fight in class', immediate_actions: 'Separated students' },
      { incident_id: 'inc-2', description: 'Verbal argument', immediate_actions: null },
    ];

    it('should return a paginated list of incidents for the case', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      (listIncidents as any).mockResolvedValue({ incidents: mockList, total: 5 });

      const res = await request(app)
        .get(`/api/cases/${CASE_ID}/incidents`)
        .query({ page: '2', limit: '2' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockList);
      expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 5, hasMore: true });
      expect(listIncidents).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ case_id: CASE_ID, page: 2, limit: 2 }),
      );
    });

    it('should redact narratives for IT_ADMIN (data minimization ABAC)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'IT_ADMIN');
      (listIncidents as any).mockResolvedValue({ incidents: mockList, total: 2 });

      const res = await request(app)
        .get(`/api/cases/${CASE_ID}/incidents`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      for (const incident of res.body.data) {
        expect(incident.description).toBe('[REDACTED]');
        expect(incident.immediate_actions).toBeNull();
      }
    });

    it('should reject limit above the maximum (validation)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');

      const res = await request(app)
        .get(`/api/cases/${CASE_ID}/incidents`)
        .query({ limit: '101' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(listIncidents).not.toHaveBeenCalled();
    });

    it('should reject invalid severity filter (validation)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');

      const res = await request(app)
        .get(`/api/cases/${CASE_ID}/incidents`)
        .query({ severity: 'EXTREME' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require incidents:read permission (STUDENT → 403)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'STUDENT');

      const res = await request(app)
        .get(`/api/cases/${CASE_ID}/incidents`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/api/cases/${CASE_ID}/incidents`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── GET /api/incidents/:incidentId ─────────────────────────────────────────

  describe('GET /api/incidents/:incidentId', () => {
    it('should return a single incident', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      const mockIncident = { incident_id: INCIDENT_ID, description: 'Fight in class' };
      (getIncidentById as any).mockResolvedValue(mockIncident);

      const res = await request(app)
        .get(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockIncident);
      expect(getIncidentById).toHaveBeenCalledWith(TENANT, INCIDENT_ID);
    });

    it('should redact the narrative for IT_ADMIN', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'IT_ADMIN');
      (getIncidentById as any).mockResolvedValue({
        incident_id: INCIDENT_ID,
        description: 'Fight in class',
        immediate_actions: 'Called parents',
      });

      const res = await request(app)
        .get(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('[REDACTED]');
      expect(res.body.data.immediate_actions).toBeNull();
    });

    it('should require incidents:read permission (STUDENT → 403)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'STUDENT');

      const res = await request(app)
        .get(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/api/incidents/${INCIDENT_ID}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── PATCH /api/incidents/:incidentId ───────────────────────────────────────

  describe('PATCH /api/incidents/:incidentId', () => {
    it('should update an incident', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      const updated = { incident_id: INCIDENT_ID, severity: 'HIGH' };
      (updateIncident as any).mockResolvedValue(updated);

      const res = await request(app)
        .patch(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ severity: 'HIGH', description: 'Escalated after follow-up.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updated);
      expect(updateIncident).toHaveBeenCalledWith(
        TENANT,
        INCIDENT_ID,
        expect.objectContaining({ severity: 'HIGH' }),
        'user-123',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('should reject an invalid severity value (validation)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');

      const res = await request(app)
        .patch(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ severity: 'EXTREME' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(updateIncident).not.toHaveBeenCalled();
    });

    it('should reject an empty description (validation)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');

      const res = await request(app)
        .patch(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require incidents:update permission (STUDENT → 403)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'STUDENT');

      const res = await request(app)
        .patch(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ severity: 'HIGH' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch(`/api/incidents/${INCIDENT_ID}`)
        .send({ severity: 'HIGH' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── DELETE /api/incidents/:incidentId ──────────────────────────────────────

  describe('DELETE /api/incidents/:incidentId', () => {
    it('should soft-delete an incident', async () => {
      // COUNSELOR holds incidents:crud in the static matrix (IT_ADMIN is
      // read-only on incidents, so it would 403 here).
      const token = generateTestToken(TENANT, 'user-123', 'COUNSELOR');
      (softDeleteIncident as any).mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ message: 'Incident deleted successfully' });
      expect(softDeleteIncident).toHaveBeenCalledWith(
        TENANT,
        INCIDENT_ID,
        'user-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should require incidents:delete permission (STUDENT → 403)', async () => {
      const token = generateTestToken(TENANT, 'user-123', 'STUDENT');

      const res = await request(app)
        .delete(`/api/incidents/${INCIDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app).delete(`/api/incidents/${INCIDENT_ID}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
