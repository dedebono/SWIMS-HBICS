import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool, getClientWithTenant } from '../../db/pool.js';

vi.mock('../../services/consent.service.js', () => ({
  createConsent: vi.fn(),
  getConsentsByStudent: vi.fn(),
  revokeConsent: vi.fn(),
}));

describe('Consents Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('POST /api/consents', () => {
    it('should allow authorized user to create consent', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { createConsent } = await import('../../services/consent.service.js');
      (createConsent as any).mockResolvedValue({
        consent_id: 'consent-123',
        student_id: 'student-123',
        granted: true
      });

      const res = await request(app)
        .post('/api/consents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          student_id: '123e4567-e89b-12d3-a456-426614174000',
          given_by: 'PARENT',
          consent_type: 'media_processing',
          version: '1.0',
          granted: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('consent_id');
    });

    it('should require consents:create permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .post('/api/consents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          student_id: '123e4567-e89b-12d3-a456-426614174000',
          given_by: 'PARENT',
          consent_type: 'media_processing',
          version: '1.0',
          granted: true
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post('/api/consents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          student_id: '',
          given_by: '',
          consent_type: '',
          version: '',
          granted: true
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/students/:studentId/consents', () => {
    it('should allow authorized user to list consents for a student', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const mockConsents = [
        { consent_id: '1', consent_type: 'media_processing', granted: true }
      ];

      const { getConsentsByStudent } = await import('../../services/consent.service.js');
      (getConsentsByStudent as any).mockResolvedValue(mockConsents);

      const res = await request(app)
        .get('/api/students/123e4567-e89b-12d3-a456-426614174000/consents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockConsents);
    });

    it('should return empty array when no consents exist', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { getConsentsByStudent } = await import('../../services/consent.service.js');
      (getConsentsByStudent as any).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/students/123e4567-e89b-12d3-a456-426614174000/consents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    // PERSONAL has `consents: none` in the static matrix. TEACHER holds
    // `consents: readOnly`, so a TEACHER token 403'd via the ABAC class check
    // rather than RBAC — passing for the wrong reason.
    it('should require consents:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'PERSONAL');

      const res = await request(app)
        .get('/api/students/123e4567-e89b-12d3-a456-426614174000/consents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/consents/:consentId/revoke', () => {
    it('should allow authorized user to revoke consent', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const { revokeConsent } = await import('../../services/consent.service.js');
      (revokeConsent as any).mockResolvedValue({
        consent_id: 'consent-123',
        granted: false
      });

      const res = await request(app)
        .patch('/api/consents/123e4567-e89b-12d3-a456-426614174001/revoke')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reason: 'Parent requested withdrawal'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.granted).toBe(false);
    });

    it('should require reason field', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .patch('/api/consents/123e4567-e89b-12d3-a456-426614174001/revoke')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require consents:update permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .patch('/api/consents/123e4567-e89b-12d3-a456-426614174001/revoke')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Test' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
