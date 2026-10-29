import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';

// Mock the service before app is imported
vi.mock('../../services/case-shares.service.js', () => ({
  shareCase: vi.fn(),
  listCaseShares: vi.fn(),
  removeShare: vi.fn(),
  hasSharedAccess: vi.fn(),
  listAvailableTeachers: vi.fn(),
}));

import { app } from '../../index.js';
import {
  shareCase,
  listCaseShares,
  removeShare,
  listAvailableTeachers,
} from '../../services/case-shares.service.js';

const CASE_ID = '123e4567-e89b-12d3-a456-426614174001';
const TEACHER_ID = '123e4567-e89b-12d3-a456-426614174002';

describe('Case Shares Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/cases/:caseId/share', () => {
    // COUNSELOR holds `cases: crud` in the static matrix.
    it('should share a case and return 201 with the share result', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const shareResult = {
        share_id: 'share-1',
        case_id: CASE_ID,
        shared_with: [TEACHER_ID],
        permission: 'VIEW',
      };
      (shareCase as any).mockResolvedValue(shareResult);

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/share`)
        .set('Authorization', `Bearer ${token}`)
        .send({ shared_with: [TEACHER_ID], permission: 'VIEW' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(shareResult);
      expect(shareCase).toHaveBeenCalledWith(
        'tenant-123',
        CASE_ID,
        { shared_with: [TEACHER_ID], permission: 'VIEW' },
        'user-123',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should default permission to VIEW when omitted', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (shareCase as any).mockResolvedValue({ share_id: 'share-2' });

      await request(app)
        .post(`/api/cases/${CASE_ID}/share`)
        .set('Authorization', `Bearer ${token}`)
        .send({ shared_with: [TEACHER_ID] });

      expect(shareCase).toHaveBeenCalledWith(
        'tenant-123',
        CASE_ID,
        { shared_with: [TEACHER_ID] },
        'user-123',
        expect.anything(),
      );
    });

    it('should reject an empty shared_with array with 400', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/share`)
        .set('Authorization', `Bearer ${token}`)
        .send({ shared_with: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(shareCase).not.toHaveBeenCalled();
    });

    it('should reject a non-uuid entry in shared_with with 400', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/share`)
        .set('Authorization', `Bearer ${token}`)
        .send({ shared_with: ['not-a-uuid'] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(shareCase).not.toHaveBeenCalled();
    });

    it('should reject an invalid permission enum with 400', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/share`)
        .set('Authorization', `Bearer ${token}`)
        .send({ shared_with: [TEACHER_ID], permission: 'ADMIN' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(shareCase).not.toHaveBeenCalled();
    });

    // STUDENT holds `cases: none` in the static matrix → RBAC 403.
    it('should require cases:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/share`)
        .set('Authorization', `Bearer ${token}`)
        .send({ shared_with: [TEACHER_ID] });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(shareCase).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/cases/${CASE_ID}/share`)
        .send({ shared_with: [TEACHER_ID] });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/cases/:caseId/shares', () => {
    it('should list shares for a case', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const shares = [
        { share_id: 'share-1', shared_with: TEACHER_ID, permission: 'VIEW' },
        { share_id: 'share-2', shared_with: '123e4567-e89b-12d3-a456-426614174003', permission: 'CONTRIBUTE' },
      ];
      (listCaseShares as any).mockResolvedValue(shares);

      const res = await request(app)
        .get(`/api/cases/${CASE_ID}/shares`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(shares);
      expect(listCaseShares).toHaveBeenCalledWith('tenant-123', CASE_ID);
    });

    it('should return an empty list when no shares exist', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (listCaseShares as any).mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/cases/${CASE_ID}/shares`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should require cases:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .get(`/api/cases/${CASE_ID}/shares`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(listCaseShares).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/api/cases/${CASE_ID}/shares`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/cases/:caseId/share/:userId', () => {
    it('should remove a share', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (removeShare as any).mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/cases/${CASE_ID}/share/${TEACHER_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ message: 'Share removed successfully' });
      expect(removeShare).toHaveBeenCalledWith(
        'tenant-123',
        CASE_ID,
        TEACHER_ID,
        'user-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should require cases:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .delete(`/api/cases/${CASE_ID}/share/${TEACHER_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(removeShare).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app).delete(`/api/cases/${CASE_ID}/share/${TEACHER_ID}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/users/teachers (teacherRouter, mounted at /api)', () => {
    it('should list available teachers', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      const teachers = {
        teachers: [
          { user_id: TEACHER_ID, full_name: 'Budi Santoso', email: 'budi@schoold.id' },
        ],
        page: 1,
        limit: 50,
        total: 1,
      };
      (listAvailableTeachers as any).mockResolvedValue(teachers);

      const res = await request(app)
        .get('/api/users/teachers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(teachers);
      expect(listAvailableTeachers).toHaveBeenCalledWith('tenant-123', undefined);
    });

    it('should forward the page query parameter', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (listAvailableTeachers as any).mockResolvedValue({ teachers: [], total: 0 });

      await request(app)
        .get('/api/users/teachers?page=3')
        .set('Authorization', `Bearer ${token}`);

      expect(listAvailableTeachers).toHaveBeenCalledWith('tenant-123', 3);
    });

    it('should require cases:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .get('/api/users/teachers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(listAvailableTeachers).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/users/teachers');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
