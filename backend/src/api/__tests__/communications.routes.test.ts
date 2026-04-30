import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { getClientWithTenant } from '../../db/pool.js';


vi.mock('../../services/communications.service.js', () => ({
  createCommunication: vi.fn(),
  listCommunications: vi.fn(),
}));

describe('Communications Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('POST /api/cases/:caseId/communications', () => {
    it('should allow authorized user to create communication log', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { createCommunication } = await import('../../services/communications.service.js');
      (createCommunication as any).mockResolvedValue({
        communication_id: 'comm-123',
        case_id: 'case-123',
        message: 'Test communication',
        channel: 'EMAIL'
      });

      const res = await request(app)
        .post('/api/cases/case-123/communications')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Test communication',
          contact_name: 'John Doe',
          contact_role: 'Parent',
          channel: 'EMAIL'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('communication_id');
    });

    it('should require cases:update permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .post('/api/cases/case-123/communications')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Test',
          contact_name: 'John',
          contact_role: 'Parent'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post('/api/cases/case-123/communications')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: '',
          contact_name: '',
          contact_role: ''
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/cases/:caseId/communications', () => {
    it('should allow authorized user to list communications for a case', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const mockComms = [
        { communication_id: '1', message: 'Test message', channel: 'PHONE' }
      ];

      const { listCommunications } = await import('../../services/communications.service.js');
      (listCommunications as any).mockResolvedValue(mockComms);

      const res = await request(app)
        .get('/api/cases/case-123/communications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockComms);
    });

    it('should require cases:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .get('/api/cases/case-123/communications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/cases/case-123/communications');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
