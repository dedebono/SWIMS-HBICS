import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { getClientWithTenant } from '../../db/pool.js';
import { generateStudentReport, getReportUrl } from '../../services/reports.service.js';

// Mock services before app import
vi.mock('../../services/reports.service.js', () => ({
  generateStudentReport: vi.fn(),
  getReportUrl: vi.fn(),
}));

import { app } from '../../index.js';

describe('Reports Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('POST /api/reports/generate', () => {
    it('should allow authorized user to generate report', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (generateStudentReport as any).mockResolvedValue('report-123');

      const res = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          student_id: '123e4567-e89b-12d3-a456-426614174000'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('reportId', 'report-123');
      expect(res.body.data.message).toBe('Report generated successfully');
    });

    it('should require reports:create permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          student_id: '123e4567-e89b-12d3-a456-426614174000'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require student_id field', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/reports/generate')
        .send({ student_id: '123e4567-e89b-12d3-a456-426614174000' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/:reportId', () => {
    it('should allow authorized user to get report URL', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (getReportUrl as any).mockResolvedValue('https://storage.example.com/reports/report-123.pdf');

      const res = await request(app)
        .get('/api/reports/report-123')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('downloadUrl');
    });



    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/reports/report-123');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
