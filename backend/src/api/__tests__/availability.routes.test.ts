import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';

// Mock the service BEFORE app is imported
vi.mock('../../services/availability.service.js', () => ({
  listAvailability: vi.fn(),
  createAvailabilitySlot: vi.fn(),
  createRecurringSlots: vi.fn(),
  claimAwaitingAppointments: vi.fn(),
  updateAvailabilitySlot: vi.fn(),
  deleteAvailabilitySlot: vi.fn(),
}));

// Never let tests send actual notifications (route notifies creators of
// claimed awaiting appointments).
vi.mock('../../services/notifications.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notifyProfessional: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../../index.js';
import * as availabilityService from '../../services/availability.service.js';
import { notifyProfessional } from '../../services/notifications.service.js';

const TENANT = 'tenant-123';
const USER = 'user-123';

// BOARD_MEMBER has availability: none in the static matrix (the source
// checkPermission falls back to), so it 403s on every availability endpoint.
const DENY_ROLE = 'BOARD_MEMBER';

describe('Availability Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (notifyProfessional as any).mockResolvedValue(undefined);
    (availabilityService.claimAwaitingAppointments as any).mockResolvedValue([]);
  });

  // ─── GET /:professionalId ────────────────────────────────────────────────

  describe('GET /api/availability/:professionalId', () => {
    it('should list slots for a professional', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItems = [
        { slot_id: 'slot-1', slot_start: '2026-01-05T09:00:00Z', is_available: true },
      ];
      (availabilityService.listAvailability as any).mockResolvedValue(mockItems);

      const res = await request(app)
        .get('/api/availability/pro-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItems);
      expect(availabilityService.listAvailability).toHaveBeenCalledWith(TENANT, 'pro-1');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/availability/pro-1');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require availability:read permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .get('/api/availability/pro-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(availabilityService.listAvailability).not.toHaveBeenCalled();
    });
  });

  // ─── POST / ──────────────────────────────────────────────────────────────

  describe('POST /api/availability', () => {
    it('should create a single slot owned by the current user', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (availabilityService.createAvailabilitySlot as any).mockResolvedValue({ slot_id: 'slot-1' });

      const res = await request(app)
        .post('/api/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slot_start: '2026-01-05T09:00:00Z',
          slot_end: '2026-01-05T10:00:00Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ count: 1 });
      expect(availabilityService.createAvailabilitySlot).toHaveBeenCalledWith(TENANT, {
        professional_id: USER,
        slot_start: '2026-01-05T09:00:00Z',
        slot_end: '2026-01-05T10:00:00Z',
        is_available: true,
      });
      expect(availabilityService.createRecurringSlots).not.toHaveBeenCalled();
    });

    it('should create recurring slots when repeat_pattern is given', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const slots = [
        { slot_id: 's1' },
        { slot_id: 's2' },
        { slot_id: 's3' },
      ];
      (availabilityService.createRecurringSlots as any).mockResolvedValue(slots);

      const res = await request(app)
        .post('/api/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slot_start: '2026-01-05T09:00:00Z',
          slot_end: '2026-01-05T10:00:00Z',
          repeat_pattern: 'weekly',
          repeat_day: 1,
          repeat_weeks: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ count: 3 });
      expect(availabilityService.createRecurringSlots).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          professional_id: USER,
          repeat_pattern: 'weekly',
          repeat_day: 1,
          repeat_weeks: 3,
          repeat_count: 8,
        }),
      );
      expect(availabilityService.createAvailabilitySlot).not.toHaveBeenCalled();
    });

    it('should notify creators of claimed awaiting appointments', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (availabilityService.createAvailabilitySlot as any).mockResolvedValue({ slot_id: 'slot-1' });
      (availabilityService.claimAwaitingAppointments as any).mockResolvedValue([
        { appointment_id: 'apt-1', created_by: 'teacher-1' },
        { appointment_id: 'apt-2', created_by: null },
      ]);

      await request(app)
        .post('/api/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({ slot_start: '2026-01-05T09:00:00Z', slot_end: '2026-01-05T10:00:00Z' });

      // Notified once — for the claim that has a creator; skipped for null.
      expect(notifyProfessional).toHaveBeenCalledTimes(1);
      expect(notifyProfessional).toHaveBeenCalledWith(
        TENANT,
        'teacher-1',
        expect.objectContaining({ type: 'SCHEDULE_UPDATE' }),
      );
    });

    it('should still create the slot when claiming awaiting appointments fails', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (availabilityService.createAvailabilitySlot as any).mockResolvedValue({ slot_id: 'slot-1' });
      (availabilityService.claimAwaitingAppointments as any).mockRejectedValue(
        new Error('db down'),
      );

      const res = await request(app)
        .post('/api/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({ slot_start: '2026-01-05T09:00:00Z', slot_end: '2026-01-05T10:00:00Z' });

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ count: 1 });
    });

    it('should reject a missing slot_start', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');

      const res = await request(app)
        .post('/api/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({ slot_end: '2026-01-05T10:00:00Z' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(availabilityService.createAvailabilitySlot).not.toHaveBeenCalled();
    });

    it('should reject an out-of-range repeat_day', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');

      const res = await request(app)
        .post('/api/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slot_start: '2026-01-05T09:00:00Z',
          slot_end: '2026-01-05T10:00:00Z',
          repeat_pattern: 'weekly',
          repeat_day: 9,
        });

      expect(res.status).toBe(400);
      expect(availabilityService.createRecurringSlots).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/availability')
        .send({ slot_start: '2026-01-05T09:00:00Z', slot_end: '2026-01-05T10:00:00Z' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require availability:create permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .post('/api/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({ slot_start: '2026-01-05T09:00:00Z', slot_end: '2026-01-05T10:00:00Z' });

      expect(res.status).toBe(403);
      expect(availabilityService.createAvailabilitySlot).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /:slotId ──────────────────────────────────────────────────────

  describe('PATCH /api/availability/:slotId', () => {
    it('should update a slot', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      const mockItem = { slot_id: 'slot-1', is_available: false };
      (availabilityService.updateAvailabilitySlot as any).mockResolvedValue(mockItem);

      const res = await request(app)
        .patch('/api/availability/slot-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ is_available: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockItem);
      expect(availabilityService.updateAvailabilitySlot).toHaveBeenCalledWith(
        TENANT,
        'slot-1',
        { is_available: false },
      );
    });

    it('should return 404 when the slot does not exist', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (availabilityService.updateAvailabilitySlot as any).mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/availability/slot-missing')
        .set('Authorization', `Bearer ${token}`)
        .send({ is_available: false });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch('/api/availability/slot-1')
        .send({ is_available: false });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require availability:update permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .patch('/api/availability/slot-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ is_available: false });

      expect(res.status).toBe(403);
      expect(availabilityService.updateAvailabilitySlot).not.toHaveBeenCalled();
    });
  });

  // ─── DELETE /:slotId ─────────────────────────────────────────────────────

  describe('DELETE /api/availability/:slotId', () => {
    it('should soft-delete a slot', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (availabilityService.deleteAvailabilitySlot as any).mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/availability/slot-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ deleted: true });
      expect(availabilityService.deleteAvailabilitySlot).toHaveBeenCalledWith(TENANT, 'slot-1');
    });

    it('should return 404 when the slot does not exist', async () => {
      const token = generateTestToken(TENANT, USER, 'COUNSELOR');
      (availabilityService.deleteAvailabilitySlot as any).mockResolvedValue(false);

      const res = await request(app)
        .delete('/api/availability/slot-missing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).delete('/api/availability/slot-1');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require availability:delete permission', async () => {
      const token = generateTestToken(TENANT, USER, DENY_ROLE);

      const res = await request(app)
        .delete('/api/availability/slot-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(availabilityService.deleteAvailabilitySlot).not.toHaveBeenCalled();
    });
  });
});
