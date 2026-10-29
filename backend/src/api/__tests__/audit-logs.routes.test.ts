import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { queryWithTenant } from '../../db/pool.js';

// audit-logs has no service module — the route queries the DB directly via
// queryWithTenant (count query first, then the data query).
// Global setup mocks ../db/pool.js with vi.fn()s, so we re-stub per test.

vi.mock('../../utils/audit-log.js', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

const MOCK_ROWS = [
  {
    log_id: 'log-1',
    tenant_id: 'tenant-123',
    entity_type: 'case',
    entity_id: '123e4567-e89b-12d3-a456-426614174001',
    action: 'CREATE',
    actor_id: 'user-123',
    created_at: '2026-01-02T03:04:05.000Z',
  },
  {
    log_id: 'log-2',
    tenant_id: 'tenant-123',
    entity_type: 'incident',
    entity_id: '123e4567-e89b-12d3-a456-426614174002',
    action: 'UPDATE',
    actor_id: 'user-123',
    created_at: '2026-01-01T03:04:05.000Z',
  },
];

describe('Audit Logs Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/audit-logs', () => {
    // COUNSELOR holds `audit_logs: readOnly` in the static matrix, so the happy
    // path passes RBAC (the route is NOT admin-only).
    it('should list audit logs with pagination meta for COUNSELOR', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (queryWithTenant as any)
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 }) // COUNT(*)
        .mockResolvedValueOnce({ rows: MOCK_ROWS, rowCount: 2 }); // data

      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(MOCK_ROWS);
      expect(res.body.meta).toEqual({ page: 1, limit: 50, total: 2, hasMore: false });
    });

    it('should pass tenant id and query filters to the DB layer', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (queryWithTenant as any)
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [MOCK_ROWS[0]], rowCount: 1 });

      await request(app)
        .get('/api/audit-logs')
        .query({
          entity_type: 'case',
          entity_id: '123e4567-e89b-12d3-a456-426614174001',
          action: 'CREATE',
          page: '2',
          limit: '10',
        })
        .set('Authorization', `Bearer ${token}`);

      // COUNT query: tenant first, then filters in schema order.
      const countArgs = (queryWithTenant as any).mock.calls[0];
      expect(countArgs[0]).toBe('tenant-123');
      expect(countArgs[2]).toEqual([
        'tenant-123',
        'case',
        '123e4567-e89b-12d3-a456-426614174001',
        'CREATE',
      ]);

      // Data query appends LIMIT and OFFSET (page 2, limit 10 → offset 10).
      const dataArgs = (queryWithTenant as any).mock.calls[1];
      expect(dataArgs[2]).toEqual([
        'tenant-123',
        'case',
        '123e4567-e89b-12d3-a456-426614174001',
        'CREATE',
        10,
        10,
      ]);
    });

    it('should flag hasMore when more pages exist', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (queryWithTenant as any)
        .mockResolvedValueOnce({ rows: [{ count: '60' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: MOCK_ROWS, rowCount: 2 });

      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(60);
      expect(res.body.meta.hasMore).toBe(true);
    });

    it('should reject limit above 100 with 400', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .get('/api/audit-logs?limit=200')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject page 0 with 400', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .get('/api/audit-logs?page=0')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject a malformed from/to datetime with 400', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .get('/api/audit-logs?from=not-a-date')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    // STUDENT holds `audit_logs: none` in the static matrix → RBAC 403.
    it('should require audit_logs:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(queryWithTenant).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/audit-logs');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
