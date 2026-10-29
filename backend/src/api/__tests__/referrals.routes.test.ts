import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';

// Mock the service before app is imported
vi.mock('../../services/referrals.service.js', () => ({
  createReferral: vi.fn(),
  listReferrals: vi.fn(),
  approveReferral: vi.fn(),
  recordExternalResult: vi.fn(),
}));

import { app } from '../../index.js';
import { pool } from '../../db/pool.js';
import {
  createReferral,
  listReferrals,
  approveReferral,
  recordExternalResult,
} from '../../services/referrals.service.js';

const token = (role: string) => generateTestToken('tenant-123', 'user-123', role);

describe('Referrals Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock tenant validation for setTenantContext middleware
    (pool.query as any).mockImplementation((queryStr: string) => {
      if (queryStr.includes('SELECT tenant_id')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: 'tenant-123' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  describe('POST /api/referrals', () => {
    it('should create a referral as COUNSELOR with recommended_by from the JWT', async () => {
      const mockReferral = { id: 'ref-1', status: 'pending' };
      (createReferral as any).mockResolvedValue(mockReferral);

      const res = await request(app)
        .post('/api/referrals')
        .set('Authorization', `Bearer ${token('COUNSELOR')}`)
        .send({
          appointment_id: 'apt-123',
          reason: 'Butuh konsultasi psikolog',
          referral_type: 'internal_psychologist',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockReferral);
      expect(createReferral).toHaveBeenCalledWith('tenant-123', {
        appointment_id: 'apt-123',
        reason: 'Butuh konsultasi psikolog',
        referral_type: 'internal_psychologist',
        recommended_by: 'user-123',
      });
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .send({ appointment_id: 'apt-123', reason: 'x', referral_type: 'internal_psychologist' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    // BOARD_MEMBER has `appointments: none` in the static matrix (PERSONAL has
    // `cr` and may create), so checkPermission('appointments', 'create') must
    // reject before the handler runs.
    it('should 403 for BOARD_MEMBER (no appointments:create)', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .set('Authorization', `Bearer ${token('BOARD_MEMBER')}`)
        .send({
          appointment_id: 'apt-123',
          reason: 'x',
          referral_type: 'internal_psychologist',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(createReferral).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/referrals', () => {
    it('should list referrals scoped to the caller role and user', async () => {
      const items = [{ id: 'ref-1', status: 'pending' }];
      (listReferrals as any).mockResolvedValue(items);

      const res = await request(app)
        .get('/api/referrals')
        .set('Authorization', `Bearer ${token('COUNSELOR')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(items);
      expect(listReferrals).toHaveBeenCalledWith('tenant-123', {
        role: 'COUNSELOR',
        userId: 'user-123',
      });
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/referrals');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    // BOARD_MEMBER has `appointments: none` in the static matrix.
    it('should 403 for BOARD_MEMBER (no appointments:read)', async () => {
      const res = await request(app)
        .get('/api/referrals')
        .set('Authorization', `Bearer ${token('BOARD_MEMBER')}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(listReferrals).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/referrals/:id/approve', () => {
    it('should approve a referral as SCHOOL_HEAD', async () => {
      const mockReferral = { id: 'ref-1', status: 'approved' };
      (approveReferral as any).mockResolvedValue(mockReferral);

      const res = await request(app)
        .post('/api/referrals/ref-1/approve')
        .set('Authorization', `Bearer ${token('SCHOOL_HEAD')}`)
        .send({ approve: true, note: 'Disetujui' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('approved');
      expect(approveReferral).toHaveBeenCalledWith('tenant-123', 'ref-1', 'user-123', true, 'Disetujui');
    });

    it('should reject a referral as SCHOOL_HEAD', async () => {
      (approveReferral as any).mockResolvedValue({ id: 'ref-1', status: 'rejected' });

      const res = await request(app)
        .post('/api/referrals/ref-1/approve')
        .set('Authorization', `Bearer ${token('SCHOOL_HEAD')}`)
        .send({ approve: false });

      expect(res.status).toBe(200);
      expect(approveReferral).toHaveBeenCalledWith('tenant-123', 'ref-1', 'user-123', false, undefined);
    });

    it('should 403 for COUNSELOR (inline SCHOOL_HEAD check)', async () => {
      const res = await request(app)
        .post('/api/referrals/ref-1/approve')
        .set('Authorization', `Bearer ${token('COUNSELOR')}`)
        .send({ approve: true });

      expect(res.status).toBe(403);
      // The inline role check returns { message } without the success envelope.
      expect(res.body.message).toBe('Hanya School Head yang dapat menyetujui rujukan.');
      expect(approveReferral).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/referrals/ref-1/approve')
        .send({ approve: true });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/referrals/:id/external-result', () => {
    it('should record the external result as COUNSELOR', async () => {
      const mockReferral = { id: 'ref-1', status: 'completed' };
      (recordExternalResult as any).mockResolvedValue(mockReferral);

      const res = await request(app)
        .post('/api/referrals/ref-1/external-result')
        .set('Authorization', `Bearer ${token('COUNSELOR')}`)
        .send({ note: 'Sudah konsultasi di Puspaga' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
      expect(recordExternalResult).toHaveBeenCalledWith('tenant-123', 'ref-1', 'user-123', 'Sudah konsultasi di Puspaga');
    });

    it('should allow SCHOOL_NURSE too', async () => {
      (recordExternalResult as any).mockResolvedValue({ id: 'ref-2', status: 'completed' });

      const res = await request(app)
        .post('/api/referrals/ref-2/external-result')
        .set('Authorization', `Bearer ${token('SCHOOL_NURSE')}`)
        .send({ note: 'Selesai' });

      expect(res.status).toBe(200);
      expect(recordExternalResult).toHaveBeenCalledWith('tenant-123', 'ref-2', 'user-123', 'Selesai');
    });

    it('should 403 for SCHOOL_HEAD (inline COUNSELOR/SCHOOL_NURSE check)', async () => {
      const res = await request(app)
        .post('/api/referrals/ref-1/external-result')
        .set('Authorization', `Bearer ${token('SCHOOL_HEAD')}`)
        .send({ note: 'x' });

      expect(res.status).toBe(403);
      // The inline role check returns { message } without the success envelope.
      expect(res.body.message).toBe('Hanya konselor/nurse yang dapat mengisi hasil konsultasi.');
      expect(recordExternalResult).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/referrals/ref-1/external-result')
        .send({ note: 'x' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
