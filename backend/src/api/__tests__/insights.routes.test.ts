import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool } from '../../db/pool.js';

vi.mock('../../services/ai-insights.service.js', () => ({
  startGenerationJob: vi.fn(),
  getGenerationJob: vi.fn(),
  saveConfirmedSummary: vi.fn(),
}));

const SAMPLE_INSIGHT = {
  summary: '[AI-GENERATED SUMMARY]\nAPA YANG TERJADI\nSiswu ribut di kelas.',
  sections: {
    terjadi: 'Siswa ribut di kelas.',
    sudah_dilakukan: '',
    komunikasi: '',
    posisi: '',
    saran: '- Panggil wali kelas.\n- Catat kejadiannya.',
  },
  reference: {
    category_id: 1,
    category_name: 'Pelanggaran Ringan',
    level_id: 3,
    level_name: 'Sekolah Menengah Pertama-Sekolah Menengah Atas',
    sop: [],
    sanksi: [],
  },
  stats: {
    incidents: 1,
    interventions_done: 0,
    interventions_total: 0,
    communications: 0,
    observations: 0,
    days_open: 3,
  },
};

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
    it('should start a generation job and return its status', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { startGenerationJob } = await import('../../services/ai-insights.service.js');
      (startGenerationJob as any).mockReturnValue({
        status: 'running',
        started_at: Date.now(),
      });

      const res = await request(app)
        .post('/api/cases/case-123/insights/generate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // The route only starts the job — no summary is awaited (CF 100s timeout).
      expect(res.body.data.status).toBe('running');
      expect(startGenerationJob).toHaveBeenCalledWith('tenant-123', 'case-123');
    });

    it('should return the insight immediately when the job already finished', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { startGenerationJob } = await import('../../services/ai-insights.service.js');
      (startGenerationJob as any).mockReturnValue({
        status: 'done',
        started_at: Date.now(),
        insight: SAMPLE_INSIGHT,
      });

      const res = await request(app)
        .post('/api/cases/case-123/insights/generate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('done');
      expect(res.body.data.insight.summary).toContain('Siswu ribut di kelas.');
      expect(res.body.data.insight.sections.saran).toContain('Panggil wali kelas');
      expect(res.body.data.insight.reference.category_name).toBe('Pelanggaran Ringan');
      expect(res.body.data.insight.stats.incidents).toBe(1);
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
  });

  describe('GET /api/cases/:caseId/insights/generate/status', () => {
    it('should report idle when no job exists', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { getGenerationJob } = await import('../../services/ai-insights.service.js');
      (getGenerationJob as any).mockReturnValue(null);

      const res = await request(app)
        .get('/api/cases/case-123/insights/generate/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('idle');
    });

    it('should report running', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { getGenerationJob } = await import('../../services/ai-insights.service.js');
      (getGenerationJob as any).mockReturnValue({ status: 'running', started_at: Date.now() });

      const res = await request(app)
        .get('/api/cases/case-123/insights/generate/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('running');
    });

    it('should return the finished insight', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { getGenerationJob } = await import('../../services/ai-insights.service.js');
      (getGenerationJob as any).mockReturnValue({
        status: 'done',
        started_at: Date.now(),
        insight: SAMPLE_INSIGHT,
      });

      const res = await request(app)
        .get('/api/cases/case-123/insights/generate/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('done');
      expect(res.body.data.insight.summary).toContain('Siswu ribut di kelas.');
    });

    it('should surface the job error message', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { getGenerationJob } = await import('../../services/ai-insights.service.js');
      (getGenerationJob as any).mockReturnValue({
        status: 'error',
        started_at: Date.now(),
        error: 'AI Service error: 400 Bad Request — quota exceeded',
      });

      const res = await request(app)
        .get('/api/cases/case-123/insights/generate/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('error');
      expect(res.body.data.error).toContain('quota exceeded');
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
