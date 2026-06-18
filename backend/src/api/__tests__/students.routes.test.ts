import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { getClientWithTenant } from '../../db/pool.js';
import { getStudentTimeline } from '../../services/timeline.service.js';

/**
 * Mock services before imports are used
 * (Routes import both timeline.service and students.service)
 */
vi.mock('../../services/timeline.service.js', () => ({
  getStudentTimeline: vi.fn(),
}));

vi.mock('../../services/students.service.js', () => ({
  getStudentById: vi.fn(),
  searchStudents: vi.fn(),
}));

// Import the app after mocks are set up
import { app } from '../../index.js';

describe('Students Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('GET /api/students/:studentId/timeline', () => {
    it('should return student timeline for authorized users', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const mockTimeline = {
        events: [
          { type: 'INCIDENT', description: 'Test incident', created_at: '2025-01-15' }
        ],
        total: 1
      };

      (getStudentTimeline as any).mockResolvedValue(mockTimeline);

      const res = await request(app)
        .get('/api/students/student-123/timeline')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
    });

    it('should support pagination query parameters', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (getStudentTimeline as any).mockResolvedValue({ events: [], total: 0 });

      const res = await request(app)
        .get('/api/students/student-123/timeline?page=2&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(getStudentTimeline).toHaveBeenCalledWith(
        'tenant-123',
        'student-123',
        expect.objectContaining({
          page: 2,
          limit: 10
        })
      );
    });



    it('should require students:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .get('/api/students/student-123/timeline')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/students/student-123/timeline');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should validate studentId is provided', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .get('/api/students//timeline')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
