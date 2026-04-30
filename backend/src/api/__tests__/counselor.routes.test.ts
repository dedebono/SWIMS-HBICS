import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool, getClientWithTenant } from '../../db/pool.js';

vi.mock('../../services/counselor.service.js', () => ({
  getCounselorDashboardStats: vi.fn(),
  getDormantCases: vi.fn(),
}));


describe('Counselor Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('GET /api/counselor/dashboard', () => {
    it('should return counselor dashboard stats', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const mockStats = {
        totalActiveCases: 15,
        highRiskCount: 3,
        pendingFollowUps: 7,
      };

      const mockDormant = [
        { case_id: 'case-1', student_name: 'John Doe', last_activity: '2025-01-15' }
      ];

      mockClient.query.mockImplementation((queryStr: string) => {
        return Promise.resolve({ rows: [] });
      });

      const { getCounselorDashboardStats, getDormantCases } = await import('../../services/counselor.service.js');
      (getCounselorDashboardStats as any).mockResolvedValue(mockStats);
      (getDormantCases as any).mockResolvedValue(mockDormant);

      const res = await request(app)
        .get('/api/counselor/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('stats');
      expect(res.body.data).toHaveProperty('dormantCases');
    });

    it('should require cases:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .get('/api/counselor/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/counselor/dashboard');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
