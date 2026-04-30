import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool, getClientWithTenant } from '../../db/pool.js';


describe('Alerts Routes', () => {
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

  describe('GET /api/alerts', () => {
    it('should allow users with alerts:read permission to list alerts', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'SCHOOL_HEAD');

      const res = await request(app)
        .get('/api/alerts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toEqual({ total: 0, hasMore: false });
    });

    it('should support pagination query parameters', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'SCHOOL_HEAD');

      const res = await request(app)
        .get('/api/alerts?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should prevent unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/alerts');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should prevent users without alerts:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .get('/api/alerts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/alerts/:alertId', () => {
    it('should return 501 not implemented', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'SCHOOL_HEAD');

      const res = await request(app)
        .patch('/api/alerts/alert-123')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'RESOLVED' });

      expect(res.status).toBe(501);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Alert management not yet implemented (Phase 3)');
    });

    it('should require alerts:update permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .patch('/api/alerts/alert-123')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/alerts/run-detection', () => {
    it('should return 501 not implemented', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'SCHOOL_HEAD');

      const res = await request(app)
        .post('/api/alerts/run-detection')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(501);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Pattern detection not yet implemented (Phase 3)');
    });

    it('should require alerts:update permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .post('/api/alerts/run-detection')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
