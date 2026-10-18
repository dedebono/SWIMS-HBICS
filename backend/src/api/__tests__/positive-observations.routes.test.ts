import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';

// Mock the service before app is imported
vi.mock('../../services/positive-observations.service.js', () => ({
  createObservation: vi.fn(),
  listObservationsByStudent: vi.fn(),
}));

import { app } from '../../index.js';
import { getClientWithTenant } from '../../db/pool.js';
import { createObservation, listObservationsByStudent } from '../../services/positive-observations.service.js';

describe('Positive Observations Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('POST /api/students/:studentId/observations', () => {
    it('should allow authorized user to create positive observation', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (createObservation as any).mockResolvedValue({
        observation_id: 'obs-123',
        student_id: 'student-123',
        category: 'Academic Excellence',
        description: 'Great progress in math'
      });

      const res = await request(app)
        .post('/api/students/123e4567-e89b-12d3-a456-426614174000/observations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          case_id: '123e4567-e89b-12d3-a456-426614174001',
          category: 'Academic Excellence',
          description: 'Great progress in math',
          observed_at: '2025-01-15T10:30:00Z'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('observation_id');
    });

    it('should auto-set student_id from URL parameter', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      let capturedBody: any = null;
      (createObservation as any).mockImplementation(async (tenantId, body, userId, req) => {
        capturedBody = body;
        return { observation_id: 'obs-123' };
      });

      await request(app)
        .post('/api/students/123e4567-e89b-12d3-a456-426614174000/observations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category: 'Academic',
          description: 'Test',
          observed_at: '2025-01-15T10:30:00Z'
        });

      expect(capturedBody.student_id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    // PERSONAL has `positive_observations: none` in the static matrix. Using
    // TEACHER here would 403 via the ABAC class check instead of RBAC, so the
    // test would pass for the wrong reason and silently break when ABAC is fixed.
    it('should require positive_observations:create permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'PERSONAL');

      const res = await request(app)
        .post('/api/students/123e4567-e89b-12d3-a456-426614174000/observations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category: 'Academic',
          description: 'Test',
          observed_at: '2025-01-15T10:30:00Z'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/students/123e4567-e89b-12d3-a456-426614174000/observations')
        .send({
          category: 'Academic',
          description: 'Test',
          observed_at: '2025-01-15T10:30:00Z'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post('/api/students/123e4567-e89b-12d3-a456-426614174000/observations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category: '',
          description: '',
          observed_at: ''
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/students/:studentId/observations', () => {
    it('should allow authorized user to list observations for a student', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const mockObservations = [
        { observation_id: '1', category: 'Academic', description: 'Great work' }
      ];

      (listObservationsByStudent as any).mockResolvedValue(mockObservations);

      const res = await request(app)
        .get('/api/students/123e4567-e89b-12d3-a456-426614174000/observations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockObservations);
    });

    // TEACHER holds `positive_observations: cru` in the static matrix, so RBAC
    // allows this. With the ABAC class check fixed the request now succeeds —
    // the 403 this test used to assert came from the class check, not RBAC.
    it('should allow TEACHER to read observations (RBAC permits, class scoping off)', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      (listObservationsByStudent as any).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/students/123e4567-e89b-12d3-a456-426614174000/observations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/students/123e4567-e89b-12d3-a456-426614174000/observations');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
