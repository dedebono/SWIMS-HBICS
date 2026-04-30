import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool, getClientWithTenant, queryWithTenant } from '../../db/pool.js';



describe('Analytics Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('GET /api/analytics/summary', () => {
    it('should return analytics summary for authorized users', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'SCHOOL_HEAD');

      const mockData = [
        { month: '2025-01-01T00:00:00.000Z', severity: 'LOW', count: '10' },
        { month: '2025-01-01T00:00:00.000Z', severity: 'MEDIUM', count: '5' },
        { month: '2025-02-01T00:00:00.000Z', severity: 'LOW', count: '15' },
      ];

      (queryWithTenant as any).mockImplementation((tenantId: string, queryStr: string, values: any[]) => {
        expect(tenantId).toBe('tenant-123');
        return Promise.resolve({ rows: mockData });
      });

      const res = await request(app)
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockData);
    });

    it('should return empty array when no incidents exist', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'SCHOOL_HEAD');

      (queryWithTenant as any).mockImplementation(() => {
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should require cases:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/analytics/summary');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
