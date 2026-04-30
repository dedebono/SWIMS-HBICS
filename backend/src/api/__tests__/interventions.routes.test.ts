import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { getClientWithTenant } from '../../db/pool.js';


vi.mock('../../services/interventions.service.js', () => ({
  createIntervention: vi.fn(),
  listInterventions: vi.fn(),
  updateIntervention: vi.fn(),
}));

describe('Interventions Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('POST /api/cases/:caseId/interventions', () => {
    it('should allow authorized user to create intervention', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { createIntervention } = await import('../../services/interventions.service.js');
      (createIntervention as any).mockResolvedValue({
        intervention_id: 'intervention-123',
        case_id: 'case-123',
        type: 'COUNSELING',
        description: 'Test intervention'
      });

      const res = await request(app)
        .post('/api/cases/case-123/interventions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'COUNSELING',
          description: 'Test intervention'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('intervention_id');
    });

    it('should require interventions:create permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .post('/api/cases/case-123/interventions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'COUNSELING',
          description: 'Test intervention'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/cases/case-123/interventions')
        .send({
          type: 'COUNSELING',
          description: 'Test intervention'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post('/api/cases/case-123/interventions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: '',
          description: ''
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/cases/:caseId/interventions', () => {
    it('should allow authorized user to list interventions', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const mockInterventions = [
        { intervention_id: '1', type: 'COUNSELING', description: 'Test' }
      ];

      const { listInterventions } = await import('../../services/interventions.service.js');
      (listInterventions as any).mockResolvedValue(mockInterventions);

      const res = await request(app)
        .get('/api/cases/case-123/interventions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockInterventions);
    });

    it('should require interventions:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .get('/api/cases/case-123/interventions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/interventions/:interventionId', () => {
    it('should allow authorized user to update intervention', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { updateIntervention } = await import('../../services/interventions.service.js');
      (updateIntervention as any).mockResolvedValue({
        intervention_id: 'intervention-123',
        outcome: 'Successful',
        effectiveness: 5
      });

      const res = await request(app)
        .patch('/api/interventions/intervention-123')
        .set('Authorization', `Bearer ${token}`)
        .send({
          outcome: 'Successful',
          effectiveness: 5
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.outcome).toBe('Successful');
    });

    it('should require interventions:update permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .patch('/api/interventions/intervention-123')
        .set('Authorization', `Bearer ${token}`)
        .send({ outcome: 'Done' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
