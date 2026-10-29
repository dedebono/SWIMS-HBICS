import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';

// Mock the services BEFORE app is imported
vi.mock('../../services/appointments.service.js', () => ({
  listAppointments: vi.fn(),
  getAppointment: vi.fn(),
  createAppointment: vi.fn(),
  createPersonalAppointment: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  confirmAppointment: vi.fn(),
  updateAppointmentNotes: vi.fn(),
  mediateAppointment: vi.fn(),
}));

vi.mock('../../services/psychologist-referral.service.js', () => ({
  getReferralContext: vi.fn(),
  sendParentInvite: vi.fn(),
}));

// Keep the other notification exports real (error-handler imports
// notifySystemError), but never let tests send actual notifications.
vi.mock('../../services/notifications.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notifyProfessional: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../../index.js';
import { queryWithTenant } from '../../db/pool.js';
import * as appointmentService from '../../services/appointments.service.js';
import * as referralService from '../../services/psychologist-referral.service.js';
import { notifyProfessional } from '../../services/notifications.service.js';

const TENANT = 'tenant-123';
const USER = 'user-123';

// The reschedule and /counselors handlers call bare CJS
// `require('../db/pool')`. Under vitest that resolves through Node's real CJS
// loader, which cannot find the extension-less '.ts' module — the handler 500s.
// Intercept that exact id and serve the same (vitest-mocked) queryWithTenant
// the tests below configure.
import Module from 'node:module';
const origModuleLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === '../db/pool') return { queryWithTenant };
  return origModuleLoad.call(this, request, ...rest);
};
const UUID_A = '123e4567-e89b-12d3-a456-426614174000';
const UUID_B = '123e4567-e89b-12d3-a456-426614174001';

// BOARD_MEMBER has appointments: none / cases.update: false in the static
// matrix (the source checkPermission falls back to), so it 403s on every
// appointments endpoint for the right reason.
const DENY_ROLE = 'BOARD_MEMBER';

describe('Appointments Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (notifyProfessional as any).mockResolvedValue(undefined);
    (queryWithTenant as any).mockResolvedValue({ rows: [] });
  });

  // ─── GET / ───────────────────────────────────────────────────────────────

  describe('GET /api/appointments', () => {
    it('should list appointments for authorized user', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItems = [{ appointment_id: 'apt-1', status: 'pending' }];
      (appointmentService.listAppointments as any).mockResolvedValue(mockItems);

      const res = await request(app)
        .get('/api/appointments')
        .query({ status: 'pending', type: 'student' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItems);
      expect(appointmentService.listAppointments).toHaveBeenCalledWith(TENANT, {
        created_for: undefined,
        student_id: undefined,
        counselor_id: undefined,
        psychologist_id: undefined,
        status: 'pending',
        type: 'student',
      });
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/appointments');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:read permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(appointmentService.listAppointments).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /:appointmentId/reschedule ────────────────────────────────────

  describe('PATCH /api/appointments/:appointmentId/reschedule', () => {
    const APPT = 'apt-123';
    const NEW_SLOT = 'slot-new';
    const OLD_SLOT = 'slot-old';

    function mockSlotQuery() {
      (queryWithTenant as any).mockImplementation(async (_t: string, queryStr: string) => {
        if (queryStr.includes('SELECT * FROM availability_slots')) {
          return {
            rows: [
              {
                slot_id: NEW_SLOT,
                slot_start: '2026-01-05T09:00:00Z',
                is_available: true,
                appointment_id: null,
              },
            ],
          };
        }
        return { rows: [] };
      });
    }

    it('should reschedule an appointment to a free slot and notify the counselor', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (appointmentService.getAppointment as any).mockResolvedValue({
        appointment_id: APPT,
        counselor_id: 'counselor-1',
      });
      mockSlotQuery();

      const res = await request(app)
        .patch(`/api/appointments/${APPT}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ new_slot_id: NEW_SLOT, old_slot_id: OLD_SLOT });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        appointment_id: APPT,
        new_slot_id: NEW_SLOT,
        new_scheduled_at: '2026-01-05T09:00:00Z',
      });
      expect(appointmentService.getAppointment).toHaveBeenCalledWith(TENANT, APPT);
      expect(notifyProfessional).toHaveBeenCalledWith(
        TENANT,
        'counselor-1',
        expect.objectContaining({ type: 'SCHEDULE_UPDATE' }),
      );
    });

    it('should return 404 when the appointment does not exist', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (appointmentService.getAppointment as any).mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/appointments/${APPT}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ new_slot_id: NEW_SLOT, old_slot_id: OLD_SLOT });

      expect(res.status).toBe(404);
    });

    it('should return 404 when the new slot does not exist', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (appointmentService.getAppointment as any).mockResolvedValue({ appointment_id: APPT });
      (queryWithTenant as any).mockResolvedValue({ rows: [] });

      const res = await request(app)
        .patch(`/api/appointments/${APPT}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ new_slot_id: NEW_SLOT, old_slot_id: OLD_SLOT });

      expect(res.status).toBe(404);
    });

    it('should return 409 when the new slot is already taken', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (appointmentService.getAppointment as any).mockResolvedValue({ appointment_id: APPT });
      (queryWithTenant as any).mockImplementation(async (_t: string, queryStr: string) => {
        if (queryStr.includes('SELECT * FROM availability_slots')) {
          return {
            rows: [{ slot_id: NEW_SLOT, slot_start: '2026-01-05T09:00:00Z', is_available: false, appointment_id: 'other' }],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .patch(`/api/appointments/${APPT}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ new_slot_id: NEW_SLOT, old_slot_id: OLD_SLOT });

      expect(res.status).toBe(409);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch(`/api/appointments/${APPT}/reschedule`)
        .send({ new_slot_id: NEW_SLOT, old_slot_id: OLD_SLOT });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:update permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .patch(`/api/appointments/${APPT}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ new_slot_id: NEW_SLOT, old_slot_id: OLD_SLOT });

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /:appointmentId ─────────────────────────────────────────────────

  describe('GET /api/appointments/:appointmentId', () => {
    it('should return a single appointment', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItem = { appointment_id: 'apt-9', status: 'confirmed' };
      (appointmentService.getAppointment as any).mockResolvedValue(mockItem);

      const res = await request(app)
        .get('/api/appointments/apt-9')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItem);
      expect(appointmentService.getAppointment).toHaveBeenCalledWith(TENANT, 'apt-9');
    });

    it('should return 404 when not found', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (appointmentService.getAppointment as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/appointments/apt-missing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/appointments/apt-9');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:read permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .get('/api/appointments/apt-9')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── POST / ──────────────────────────────────────────────────────────────

  describe('POST /api/appointments', () => {
    it('should create an appointment with created_by from the JWT', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItem = { appointment_id: 'apt-new', counselor_id: 'counselor-1', status: 'pending' };
      (appointmentService.createAppointment as any).mockResolvedValue(mockItem);

      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ student_id: UUID_A, counselor_id: 'counselor-1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItem);
      expect(appointmentService.createAppointment).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ student_id: UUID_A, created_by: USER }),
      );
      // Request notification is sent to the targeted professional.
      expect(notifyProfessional).toHaveBeenCalledWith(
        TENANT,
        'counselor-1',
        expect.objectContaining({ type: 'APPOINTMENT_REQUEST' }),
      );
    });

    it('should require authentication', async () => {
      const res = await request(app).post('/api/appointments').send({ student_id: UUID_A });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:create permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ student_id: UUID_A });

      expect(res.status).toBe(403);
      expect(appointmentService.createAppointment).not.toHaveBeenCalled();
    });
  });

  // ─── POST /personal ──────────────────────────────────────────────────────

  describe('POST /api/appointments/personal', () => {
    it('should create a personal appointment for staff', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockResult = { matched_counselor_id: 'counselor-2', appointment_id: 'apt-personal' };
      (appointmentService.createPersonalAppointment as any).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/appointments/personal')
        .set('Authorization', `Bearer ${token}`)
        .send({ created_for: UUID_A, location: 'online', notes: 'check-in' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockResult);
      expect(appointmentService.createPersonalAppointment).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ created_for: UUID_A, actor_id: USER }),
      );
      expect(notifyProfessional).toHaveBeenCalledWith(
        TENANT,
        'counselor-2',
        expect.objectContaining({ type: 'APPOINTMENT_REQUEST' }),
      );
    });

    it('should reject an invalid created_for uuid', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');

      const res = await request(app)
        .post('/api/appointments/personal')
        .set('Authorization', `Bearer ${token}`)
        .send({ created_for: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(appointmentService.createPersonalAppointment).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/appointments/personal')
        .send({ created_for: UUID_A });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:create permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .post('/api/appointments/personal')
        .set('Authorization', `Bearer ${token}`)
        .send({ created_for: UUID_A });

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /:appointmentId/referral-context ────────────────────────────────

  describe('GET /api/appointments/:appointmentId/referral-context', () => {
    it('should return referral context for an authorized user (cases:update)', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockCtx = { student_name: 'Budi', parent_phone: '08123' };
      (referralService.getReferralContext as any).mockResolvedValue(mockCtx);

      const res = await request(app)
        .get('/api/appointments/apt-1/referral-context')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockCtx);
      expect(referralService.getReferralContext).toHaveBeenCalledWith(TENANT, 'apt-1');
    });

    it('should return 404 when the appointment has no context', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (referralService.getReferralContext as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/appointments/apt-1/referral-context')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/appointments/apt-1/referral-context');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require cases:update permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .get('/api/appointments/apt-1/referral-context')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(referralService.getReferralContext).not.toHaveBeenCalled();
    });
  });

  // ─── POST /:appointmentId/referral ───────────────────────────────────────

  describe('POST /api/appointments/:appointmentId/referral', () => {
    it('should send the parent invite', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (referralService.sendParentInvite as any).mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/appointments/apt-1/referral')
        .set('Authorization', `Bearer ${token}`)
        .send({ parent_phone: '08123', message: 'Mohon isi kuesioner' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ success: true });
      expect(referralService.sendParentInvite).toHaveBeenCalledWith(
        TENANT,
        'apt-1',
        USER,
        { parentPhone: '08123', message: 'Mohon isi kuesioner' },
      );
    });

    it('should return 400 when the message is empty', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');

      const res = await request(app)
        .post('/api/appointments/apt-1/referral')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: '   ' });

      expect(res.status).toBe(400);
      expect(referralService.sendParentInvite).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/appointments/apt-1/referral')
        .send({ message: 'hello' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require cases:update permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .post('/api/appointments/apt-1/referral')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'hello' });

      expect(res.status).toBe(403);
      expect(referralService.sendParentInvite).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /:appointmentId/status ────────────────────────────────────────

  describe('PATCH /api/appointments/:appointmentId/status', () => {
    it('should update the appointment status', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItem = { appointment_id: 'apt-2', status: 'cancelled' };
      (appointmentService.updateAppointmentStatus as any).mockResolvedValue(mockItem);

      const res = await request(app)
        .patch('/api/appointments/apt-2/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'cancelled', notes: 'siswa sakit' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItem);
      expect(appointmentService.updateAppointmentStatus).toHaveBeenCalledWith(
        TENANT,
        'apt-2',
        'cancelled',
        USER,
        'siswa sakit',
      );
    });

    it('should return 404 when not found', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (appointmentService.updateAppointmentStatus as any).mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/appointments/apt-missing/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch('/api/appointments/apt-2/status')
        .send({ status: 'cancelled' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:update permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .patch('/api/appointments/apt-2/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(403);
    });
  });

  // ─── POST /:appointmentId/confirm ────────────────────────────────────────

  describe('POST /api/appointments/:appointmentId/confirm', () => {
    it('should confirm the appointment and notify the counselor', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItem = { appointment_id: 'apt-3', status: 'confirmed', counselor_id: 'counselor-1' };
      (appointmentService.confirmAppointment as any).mockResolvedValue(mockItem);

      const res = await request(app)
        .post('/api/appointments/apt-3/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduled_at: '2026-01-05T09:00:00Z' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItem);
      expect(appointmentService.confirmAppointment).toHaveBeenCalledWith(
        TENANT,
        'apt-3',
        '2026-01-05T09:00:00Z',
        USER,
      );
      expect(notifyProfessional).toHaveBeenCalledWith(
        TENANT,
        'counselor-1',
        expect.objectContaining({ type: 'SCHEDULE_UPDATE', title: 'Jadwal dikonfirmasi' }),
      );
    });

    it('should return 404 when not found', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (appointmentService.confirmAppointment as any).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/appointments/apt-missing/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduled_at: '2026-01-05T09:00:00Z' });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/appointments/apt-3/confirm')
        .send({ scheduled_at: '2026-01-05T09:00:00Z' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:update permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .post('/api/appointments/apt-3/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduled_at: '2026-01-05T09:00:00Z' });

      expect(res.status).toBe(403);
    });
  });

  // ─── PATCH /:appointmentId/notes ─────────────────────────────────────────

  describe('PATCH /api/appointments/:appointmentId/notes', () => {
    it('should update the appointment notes', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItem = { appointment_id: 'apt-4', notes: 'updated' };
      (appointmentService.updateAppointmentNotes as any).mockResolvedValue(mockItem);

      const res = await request(app)
        .patch('/api/appointments/apt-4/notes')
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: 'updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItem);
      expect(appointmentService.updateAppointmentNotes).toHaveBeenCalledWith(
        TENANT,
        'apt-4',
        USER,
        'updated',
      );
    });

    it('should return 404 when not found', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (appointmentService.updateAppointmentNotes as any).mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/appointments/apt-missing/notes')
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: 'x' });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch('/api/appointments/apt-4/notes')
        .send({ notes: 'x' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:update permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .patch('/api/appointments/apt-4/notes')
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: 'x' });

      expect(res.status).toBe(403);
    });
  });

  // ─── PATCH /:appointmentId/mediate ───────────────────────────────────────

  describe('PATCH /api/appointments/:appointmentId/mediate', () => {
    it('should mediate the appointment', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItem = { appointment_id: 'apt-5', status: 'confirmed' };
      (appointmentService.mediateAppointment as any).mockResolvedValue(mockItem);

      const res = await request(app)
        .patch('/api/appointments/apt-5/mediate')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'confirmed', scheduled_at: '2026-01-06T10:00:00Z', notes: 'mediated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItem);
      expect(appointmentService.mediateAppointment).toHaveBeenCalledWith(
        TENANT,
        'apt-5',
        USER,
        { status: 'confirmed', scheduled_at: '2026-01-06T10:00:00Z', notes: 'mediated' },
      );
    });

    it('should reject an invalid status enum', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');

      const res = await request(app)
        .patch('/api/appointments/apt-5/mediate')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'bogus' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(appointmentService.mediateAppointment).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch('/api/appointments/apt-5/mediate')
        .send({ status: 'confirmed' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:update permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .patch('/api/appointments/apt-5/mediate')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /counselors ─────────────────────────────────────────────────────

  describe('GET /api/appointments/counselors', () => {
    // FIXED (2026-10-29): `/counselors` used to be registered AFTER
    // `GET /:appointmentId`, so Express matched it as appointmentId='counselors'
    // and always 404'd. It now sits before the param route.
    it('returns the counselor list (no longer shadowed by /:appointmentId)', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const counselors = [
        { user_id: 'c-1', full_name: 'Sarah Chen', gender: 'F' },
        { user_id: 'c-2', full_name: 'Budi Santoso', gender: 'M' },
      ];
      (queryWithTenant as any).mockResolvedValue({ rows: counselors });

      const res = await request(app)
        .get('/api/appointments/counselors')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(counselors);
      expect(appointmentService.getAppointment).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/appointments/counselors');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require appointments:read permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .get('/api/appointments/counselors')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(queryWithTenant).not.toHaveBeenCalled();
    });
  });
});
