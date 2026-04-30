import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool, getClientWithTenant } from '../../db/pool.js';

vi.mock('../../services/ai-insights.service.js', () => ({
  generateCaseSummary: vi.fn(),
  saveConfirmedSummary: vi.fn(),
}));

describe('Insights Routes', () => {
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

  describe('POST /api/cases/:caseId/insights/generate', () => {
    it('should allow authorized user to generate AI summary', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { generateCaseSummary } = await import('../../services/ai-insights.service.js');
      (generateCaseSummary as any).mockResolvedValue('This is an AI-generated summary of the case.');

      const res = await request(app)
        .post('/api/cases/case-123/insights/generate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBe('This is an AI-generated summary of the case.');
      expect(generateCaseSummary).toHaveBeenCalledWith('tenant-123', 'case-123');
    });

    it('should require cases:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .post('/api/cases/case-123/insights/generate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/cases/case-123/insights/generate');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should handle errors during summary generation', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { generateCaseSummary } = await import('../../services/ai-insights.service.js');
      (generateCaseSummary as any).mockRejectedValue(new Error('AI service unavailable'));

      const res = await request(app)
        .post('/api/cases/case-123/insights/generate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/cases/:caseId/insights/confirm', () => {
    it('should allow authorized user to confirm summary', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { saveConfirmedSummary } = await import('../../services/ai-insights.service.js');
      (saveConfirmedSummary as any).mockResolvedValue({ message: 'Summary saved' });

      const res = await request(app)
        .post('/api/cases/case-123/insights/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ summary: 'Confirmed summary text' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('AI Summary confirmed and saved to case metadata.');
      expect(saveConfirmedSummary).toHaveBeenCalledWith('tenant-123', 'case-123', 'Confirmed summary text', 'user-123');
    });

    it('should require summary field', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post('/api/cases/case-123/insights/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require cases:update permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .post('/api/cases/case-123/insights/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ summary: 'Test summary' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/cases/case-123/insights/confirm')
        .send({ summary: 'Test summary' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
