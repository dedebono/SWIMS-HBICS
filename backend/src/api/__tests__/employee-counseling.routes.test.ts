import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';

// Mock the service and notifications BEFORE app is imported
vi.mock('../../services/employee-counseling.service.js', () => ({
  submitIntake: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  listSessions: vi.fn(),
  listSubmissions: vi.fn(),
  getSubmission: vi.fn(),
  closeSubmission: vi.fn(),
  assignCounselor: vi.fn(),
  getAccessLog: vi.fn(),
  logAccess: vi.fn(),
}));

// notifyRoles is invoked by the submit route; notifySystemError is imported by
// the error-handler middleware, so it must exist on the mock module too.
vi.mock('../../services/notifications.service.js', () => ({
  notifyRoles: vi.fn(),
  ADMIN_ROLES: ['IT_ADMIN'],
  notifySystemError: vi.fn(),
}));

import { app } from '../../index.js';
import { pool } from '../../db/pool.js';
import {
  submitIntake,
  createSession,
  updateSession,
  listSessions,
  listSubmissions,
  getSubmission,
  closeSubmission,
  assignCounselor,
  getAccessLog,
  logAccess,
} from '../../services/employee-counseling.service.js';
import { notifyRoles } from '../../services/notifications.service.js';

const TENANT = 'tenant-123';
const USER = '123e4567-e89b-12d3-a456-426614174001';
const SUB_ID = '123e4567-e89b-12d3-a456-426614174002';
const COUNSELOR_ID = '123e4567-e89b-12d3-a456-426614174003';

/** Minimal body that passes EmployeeCounselingSubmissionSchema in @swims/shared. */
function validSubmission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employee_name: 'Budi Santoso',
    unit: 'Keuangan',
    position: 'Staf Administrasi',
    contact_number: '081234567890',
    answers: {
      q1_alasan: ['stres_kerja'],
      q2_deskripsi: 'Beban kerja tinggi belakangan ini.',
      q3_durasi: 'kurang_dari_1_bulan',
      q4_dampak: 3,
      q5_area_terdampak: ['pekerjaan'],
      q6_harapan: ['konseling'],
      q7_pernah_konseling: 'belum_pernah',
      q8_safety_threat: 'tidak',
      q9_bantuan_segera: 'tidak',
      e_waktu: ['jam_kerja'],
      e_hari: 'Senin',
      e_metode: 'tatap_muka',
      e_konselor_preferensi: 'tanpa_preferensi',
    },
    consents: {
      consent_confidentiality: true,
      consent_emergency_protocol: true,
    },
    ...overrides,
  };
}

/** Minimal body that passes CreateSessionNoteSchema. */
function validSessionBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submission_id: SUB_ID,
    section_1_info: {
      employee_name: 'Budi Santoso',
      counselor_name: 'Dr. Sari',
      session_date: '2026-01-10',
      session_time: '10:00',
      method: 'tatap_muka',
    },
    section_2_presenting_concern: 'Beban kerja berlebih',
    section_3_key_points: ['Klien merasa kewalahan'],
    section_5_intervention: { type: 'Active listening', note: 'Klien terbuka' },
    section_7_action_plan: ['Evaluasi 2 minggu'],
    section_8_risk: {
      level: 'low',
      concern_description: 'Tidak ada indikasi bahaya',
      safety_action: 'tidak_dibutuhkan',
    },
    section_9_followup: {
      status: 'follow_up_disarankan',
      target_sesi_berikutnya: 'Sesi lanjutan dalam 2 minggu',
    },
    ...overrides,
  };
}

const auth = (role: string, userId = USER) =>
  ['Bearer', generateTestToken(TENANT, userId, role)].join(' ');

describe('Employee Counseling Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock tenant lookups for both setTenantFromSlug (slug → tenant_id) and
    // setTenantContext (tenant_id verification after authenticate).
    (pool.query as any).mockImplementation((queryStr: string) => {
      if (queryStr.includes('FROM tenants WHERE slug')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: TENANT }] });
      }
      if (queryStr.includes('SELECT tenant_id')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: TENANT }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  describe('POST /api/employee-counseling/submit (public)', () => {
    it('should submit an anonymous intake, notify admins and counselors, return 201', async () => {
      const submission = { submission_id: 'sub-1', employee_name: 'Budi Santoso' };
      (submitIntake as any).mockResolvedValue(submission);

      const res = await request(app)
        .post('/api/employee-counseling/submit')
        .send({ tenant: 'sekolah-contoh', ...validSubmission() });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(submission);

      // Anonymous submit: no userId in the JWT → submittedBy must be null
      const [tenantId, data, submittedBy] = (submitIntake as any).mock.calls[0];
      expect(tenantId).toBe(TENANT);
      expect(data.employee_name).toBe('Budi Santoso');
      expect(submittedBy).toBeNull();

      expect(notifyRoles).toHaveBeenCalledTimes(2);
      expect(notifyRoles).toHaveBeenCalledWith(TENANT, ['IT_ADMIN'], expect.objectContaining({ type: 'COUNSELING_REQUEST' }));
      expect(notifyRoles).toHaveBeenCalledWith(TENANT, ['COUNSELOR'], expect.objectContaining({ type: 'COUNSELING_REQUEST' }));
    });

    // FIXED (2026-10-29): the chain now runs optionalAuth, so a valid Bearer
    // token lands in submitted_by. Anonymous submits still pass with null.
    it('should set submittedBy from the token when one is present (optionalAuth)', async () => {
      (submitIntake as any).mockResolvedValue({ employee_name: 'Budi' });

      await request(app)
        .post('/api/employee-counseling/submit')
        .set('Authorization', auth('COUNSELOR'))
        .send({ tenant: 'sekolah-contoh', ...validSubmission() });

      expect((submitIntake as any).mock.calls[0][2]).toBe(USER);
    });

    it('should treat an invalid token as anonymous instead of rejecting the public route', async () => {
      (submitIntake as any).mockResolvedValue({ employee_name: 'Budi' });

      const res = await request(app)
        .post('/api/employee-counseling/submit')
        .set('Authorization', 'Bearer not-a-real-token')
        .send({ tenant: 'sekolah-contoh', ...validSubmission() });

      expect(res.status).toBe(201);
      expect((submitIntake as any).mock.calls[0][2]).toBeNull();
    });

    it('should return the standard 422 envelope when the questionnaire fails Zod', async () => {
      const res = await request(app)
        .post('/api/employee-counseling/submit')
        .send({
          tenant: 'sekolah-contoh',
          ...validSubmission({
            employee_name: '',
            consents: { consent_confidentiality: false, consent_emergency_protocol: true },
          }),
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toContain('Data belum lengkap / tidak valid');
      expect(res.body.details).toBeDefined();
    });

    it('should fail when the tenant slug is missing', async () => {
      const res = await request(app)
        .post('/api/employee-counseling/submit')
        .send(validSubmission());

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(submitIntake).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/employee-counseling/submissions', () => {
    it('should list submissions with pagination meta for COUNSELOR', async () => {
      const submissions = [
        { submission_id: 'sub-1', employee_name: 'Budi', submission_status: 'submitted' },
        { submission_id: 'sub-2', employee_name: 'Ani', submission_status: 'in_progress' },
      ];
      (listSubmissions as any).mockResolvedValue({ submissions, total: 2 });

      const res = await request(app)
        .get('/api/employee-counseling/submissions')
        .set('Authorization', auth('COUNSELOR'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(submissions);
      expect(res.body.meta).toMatchObject({ total: 2, page: 1, limit: 50, hasMore: false });
      expect(listSubmissions).toHaveBeenCalledWith(TENANT, {}, USER, 'COUNSELOR', 50, 0);
    });

    it('should forward status filter and my_assignments scoping for counselors', async () => {
      (listSubmissions as any).mockResolvedValue({ submissions: [], total: 0 });

      await request(app)
        .get('/api/employee-counseling/submissions')
        .query({ status: 'submitted', my_assignments: 'true' })
        .set('Authorization', auth('COUNSELOR'));

      expect(listSubmissions).toHaveBeenCalledWith(
        TENANT,
        { status: 'submitted', assigned_counselor_id: USER },
        USER,
        'COUNSELOR',
        50,
        0,
      );
    });

    it('should cap limit at 200 and guard against NaN limit', async () => {
      (listSubmissions as any).mockResolvedValue({ submissions: [], total: 0 });

      const capped = await request(app)
        .get('/api/employee-counseling/submissions')
        .query({ limit: '9999' })
        .set('Authorization', auth('COUNSELOR'));
      expect((listSubmissions as any).mock.calls[0][4]).toBe(200);

      const nan = await request(app)
        .get('/api/employee-counseling/submissions')
        .query({ limit: 'abc' })
        .set('Authorization', auth('COUNSELOR'));
      expect((listSubmissions as any).mock.calls[1][4]).toBe(50);
      expect(nan.status).toBe(200);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/employee-counseling/submissions');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(listSubmissions).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/employee-counseling/submissions/:id', () => {
    const submission = { submission_id: SUB_ID, employee_name: 'Budi', submitted_by: USER };

    it('should return a submission and log access for COUNSELOR', async () => {
      (getSubmission as any).mockResolvedValue(submission);

      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}`)
        .set('Authorization', auth('COUNSELOR'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(getSubmission).toHaveBeenCalledWith(TENANT, SUB_ID);
      expect(logAccess).toHaveBeenCalledWith(TENANT, SUB_ID, USER, 'Viewed submission');
    });

    it('should return 404 when the submission does not exist', async () => {
      (getSubmission as any).mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}`)
        .set('Authorization', auth('COUNSELOR'));

      expect(res.status).toBe(404);
      expect(logAccess).not.toHaveBeenCalled();
    });

    it('should return 403 when a TEACHER views someone else\u2019s submission', async () => {
      (getSubmission as any).mockResolvedValue({ ...submission, submitted_by: 'someone-else' });

      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}`)
        .set('Authorization', auth('TEACHER'));

      expect(res.status).toBe(403);
      expect(logAccess).not.toHaveBeenCalled();
    });

    it('should let a TEACHER view their own submission', async () => {
      (getSubmission as any).mockResolvedValue(submission); // submitted_by === USER

      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}`)
        .set('Authorization', auth('TEACHER'));

      expect(res.status).toBe(200);
      expect(logAccess).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/api/employee-counseling/submissions/${SUB_ID}`);

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/employee-counseling/submissions/:id/assign', () => {
    it('should assign a counselor for COUNSELOR (employee_counseling:update)', async () => {
      const updated = { submission_id: SUB_ID, assigned_counselor_id: COUNSELOR_ID };
      (assignCounselor as any).mockResolvedValue(updated);

      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/assign`)
        .set('Authorization', auth('COUNSELOR'))
        .send({ counselor_id: COUNSELOR_ID });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(assignCounselor).toHaveBeenCalledWith(TENANT, SUB_ID, { counselor_id: COUNSELOR_ID }, USER);
    });

    it('should return 404 when the submission does not exist', async () => {
      (assignCounselor as any).mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/assign`)
        .set('Authorization', auth('COUNSELOR'))
        .send({ counselor_id: COUNSELOR_ID });

      expect(res.status).toBe(404);
    });

    it('should return the standard 422 envelope for an invalid counselor_id', async () => {
      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/assign`)
        .set('Authorization', auth('COUNSELOR'))
        .send({ counselor_id: 'not-a-uuid' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Data belum lengkap / tidak valid');
      expect(assignCounselor).not.toHaveBeenCalled();
    });

    // BOARD_MEMBER holds `employee_counseling: none` in the static matrix
    // (shared/dist/permissions.js), so update must be denied.
    it('should require employee_counseling:update permission', async () => {
      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/assign`)
        .set('Authorization', auth('BOARD_MEMBER'))
        .send({ counselor_id: COUNSELOR_ID });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(assignCounselor).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/assign`)
        .send({ counselor_id: COUNSELOR_ID });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/employee-counseling/sessions', () => {
    it('should create a session note for COUNSELOR (employee_counseling:create)', async () => {
      const session = { session_id: 'sess-1', session_number: 1 };
      (createSession as any).mockResolvedValue(session);

      const res = await request(app)
        .post('/api/employee-counseling/sessions')
        .set('Authorization', auth('COUNSELOR'))
        .send(validSessionBody());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(session);
      expect(createSession).toHaveBeenCalledWith(TENANT, expect.objectContaining({ submission_id: SUB_ID }), USER);
    });

    it('should return the standard 422 envelope for an invalid session note', async () => {
      const res = await request(app)
        .post('/api/employee-counseling/sessions')
        .set('Authorization', auth('COUNSELOR'))
        .send(validSessionBody({ submission_id: 'not-a-uuid' }));

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(createSession).not.toHaveBeenCalled();
    });

    it('should require employee_counseling:create permission', async () => {
      const res = await request(app)
        .post('/api/employee-counseling/sessions')
        .set('Authorization', auth('BOARD_MEMBER'))
        .send(validSessionBody());

      expect(res.status).toBe(403);
      expect(createSession).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/employee-counseling/sessions')
        .send(validSessionBody());

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/employee-counseling/sessions/:id', () => {
    it('should partially update a session note for COUNSELOR', async () => {
      const updated = { session_id: 'sess-1', section_2_presenting_concern: 'Diperbarui' };
      (updateSession as any).mockResolvedValue(updated);

      const res = await request(app)
        .patch('/api/employee-counseling/sessions/sess-1')
        .set('Authorization', auth('COUNSELOR'))
        .send({ section_2_presenting_concern: 'Diperbarui' });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(updated);
      expect(updateSession).toHaveBeenCalledWith(TENANT, 'sess-1', { section_2_presenting_concern: 'Diperbarui' }, USER);
    });

    it('should return 404 when the session does not exist', async () => {
      (updateSession as any).mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/employee-counseling/sessions/sess-1')
        .set('Authorization', auth('COUNSELOR'))
        .send({ section_2_presenting_concern: 'x' });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch('/api/employee-counseling/sessions/sess-1')
        .send({ section_2_presenting_concern: 'x' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/employee-counseling/submissions/:id/sessions', () => {
    it('should list sessions for a submission for COUNSELOR', async () => {
      const sessions = [{ session_id: 'sess-1', session_number: 1 }];
      (listSessions as any).mockResolvedValue(sessions);

      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}/sessions`)
        .set('Authorization', auth('COUNSELOR'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(sessions);
      expect(listSessions).toHaveBeenCalledWith(TENANT, SUB_ID);
    });

    // BOARD_MEMBER holds `employee_counseling: none` → read denied
    it('should require employee_counseling:read permission', async () => {
      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}/sessions`)
        .set('Authorization', auth('BOARD_MEMBER'));

      expect(res.status).toBe(403);
      expect(listSessions).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}/sessions`);

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/employee-counseling/submissions/:id/close', () => {
    it('should close a submission for COUNSELOR', async () => {
      const updated = { submission_id: SUB_ID, submission_status: 'closed' };
      (closeSubmission as any).mockResolvedValue(updated);

      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/close`)
        .set('Authorization', auth('COUNSELOR'))
        .send({ closure: { reason: 'Selesai', summary: 'Klien pulih' } });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(updated);
      expect(closeSubmission).toHaveBeenCalledWith(
        TENANT,
        SUB_ID,
        { closure: { reason: 'Selesai', summary: 'Klien pulih' } },
        USER,
      );
    });

    it('should return the standard 422 envelope when closure is missing', async () => {
      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/close`)
        .set('Authorization', auth('COUNSELOR'))
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(closeSubmission).not.toHaveBeenCalled();
    });

    it('should return 404 when the submission does not exist', async () => {
      (closeSubmission as any).mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/close`)
        .set('Authorization', auth('COUNSELOR'))
        .send({ closure: { reason: 'Selesai', summary: 'Klien pulih' } });

      expect(res.status).toBe(404);
    });

    it('should require employee_counseling:update permission', async () => {
      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/close`)
        .set('Authorization', auth('BOARD_MEMBER'))
        .send({ closure: { reason: 'Selesai', summary: 'Klien pulih' } });

      expect(res.status).toBe(403);
      expect(closeSubmission).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch(`/api/employee-counseling/submissions/${SUB_ID}/close`)
        .send({ closure: { reason: 'Selesai', summary: 'Klien pulih' } });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/employee-counseling/submissions/:id/access-log', () => {
    it('should return the access log for IT_ADMIN', async () => {
      const log = [{ log_id: 'log-1', access_reason: 'Viewed submission' }];
      (getAccessLog as any).mockResolvedValue(log);

      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}/access-log`)
        .set('Authorization', auth('IT_ADMIN'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(log);
      expect(getAccessLog).toHaveBeenCalledWith(TENANT, SUB_ID);
    });

    // Route-level admin-only guard: COUNSELOR passes employee_counseling:read
    // but role !== 'IT_ADMIN' → 403 'Admin only'.
    it('should return 403 for non-admin roles even with read permission', async () => {
      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}/access-log`)
        .set('Authorization', auth('COUNSELOR'));

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Admin only');
      expect(getAccessLog).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get(`/api/employee-counseling/submissions/${SUB_ID}/access-log`);

      expect(res.status).toBe(401);
    });
  });
});
