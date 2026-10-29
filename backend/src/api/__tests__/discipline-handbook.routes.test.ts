import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';

// Mock the service before app is imported. The route does a namespace import
// (`import * as service`), so every function it calls must be a vi.fn().
vi.mock('../../services/discipline-handbook.service.js', () => ({
  getFullHandbook: vi.fn(),
  searchBehaviors: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listEducationLevels: vi.fn(),
  createEducationLevel: vi.fn(),
  updateEducationLevel: vi.fn(),
  deleteEducationLevel: vi.fn(),
  listBehaviorGroups: vi.fn(),
  createBehaviorGroup: vi.fn(),
  deleteBehaviorGroup: vi.fn(),
  listBehaviorDetails: vi.fn(),
  createBehaviorDetail: vi.fn(),
  setBehaviorLevels: vi.fn(),
  getBehaviorLevels: vi.fn(),
  deleteBehaviorDetail: vi.fn(),
  listHandlingGuidelines: vi.fn(),
  createHandlingGuideline: vi.fn(),
  updateHandlingGuideline: vi.fn(),
  deleteHandlingGuideline: vi.fn(),
  listConsequenceGuidelines: vi.fn(),
  createConsequenceGuideline: vi.fn(),
  updateConsequenceGuideline: vi.fn(),
  deleteConsequenceGuideline: vi.fn(),
  listRequiredDocuments: vi.fn(),
  createRequiredDocument: vi.fn(),
  updateRequiredDocument: vi.fn(),
  deleteRequiredDocument: vi.fn(),
  exportHandbookData: vi.fn(),
  importHandbookData: vi.fn(),
}));

import { app } from '../../index.js';
import { pool } from '../../db/pool.js';
import * as service from '../../services/discipline-handbook.service.js';

const COUNSELOR = () => generateTestToken('tenant-123', 'user-123', 'COUNSELOR');
const IT_ADMIN = () => generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');
const TEACHER = () => generateTestToken('tenant-123', 'user-123', 'TEACHER');

describe('Discipline Handbook Routes', () => {
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

  // ─── Tree & Search ───────────────────────────────────────────────────────

  describe('GET /api/discipline-handbook/tree', () => {
    it('should return the full handbook tree', async () => {
      const tree = { categories: [{ id: 1, name: 'Perundungan' }] };
      (service.getFullHandbook as any).mockResolvedValue(tree);

      const res = await request(app)
        .get('/api/discipline-handbook/tree')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(tree);
      expect(service.getFullHandbook).toHaveBeenCalledWith('tenant-123', undefined);
    });

    it('should pass level_id as a number when provided', async () => {
      (service.getFullHandbook as any).mockResolvedValue({ categories: [] });

      const res = await request(app)
        .get('/api/discipline-handbook/tree?level_id=3')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(service.getFullHandbook).toHaveBeenCalledWith('tenant-123', 3);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/discipline-handbook/tree');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/discipline-handbook/search', () => {
    it('should search behaviors with parsed filters', async () => {
      const results = [{ id: 9, behavior_text: 'Berkelahi' }];
      (service.searchBehaviors as any).mockResolvedValue(results);

      const res = await request(app)
        .get('/api/discipline-handbook/search?q=berkelahi&category_id=1&level_id=2&group_id=3')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(results);
      expect(service.searchBehaviors).toHaveBeenCalledWith('tenant-123', {
        q: 'berkelahi',
        category_id: 1,
        level_id: 2,
        group_id: 3,
      });
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/discipline-handbook/search?q=x');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Categories ──────────────────────────────────────────────────────────

  describe('GET /api/discipline-handbook/categories', () => {
    it('should list categories', async () => {
      const rows = [{ id: 1, name: 'Perundungan' }];
      (service.listCategories as any).mockResolvedValue(rows);

      const res = await request(app)
        .get('/api/discipline-handbook/categories')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(rows);
      expect(service.listCategories).toHaveBeenCalledWith('tenant-123');
    });
  });

  describe('POST /api/discipline-handbook/categories', () => {
    it('should create a category as COUNSELOR', async () => {
      const body = { name: 'Kekerasan', code: 'VIO' };
      (service.createCategory as any).mockResolvedValue({ id: 2, ...body });

      const res = await request(app)
        .post('/api/discipline-handbook/categories')
        .set('Authorization', `Bearer ${COUNSELOR()}`)
        .send(body);

      // Route passes 201 as sendSuccess's `meta` arg, so status stays 200.
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(2);
      expect(service.createCategory).toHaveBeenCalledWith('tenant-123', body);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/discipline-handbook/categories')
        .send({ name: 'X' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    // requireRole throws UnauthorizedError, so a disallowed role yields 401 (not 403).
    it('should reject TEACHER (not IT_ADMIN/COUNSELOR)', async () => {
      const res = await request(app)
        .post('/api/discipline-handbook/categories')
        .set('Authorization', `Bearer ${TEACHER()}`)
        .send({ name: 'X' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(service.createCategory).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/discipline-handbook/categories/:id', () => {
    it('should update a category', async () => {
      (service.updateCategory as any).mockResolvedValue({ id: 1, name: 'Updated' });

      const res = await request(app)
        .put('/api/discipline-handbook/categories/1')
        .set('Authorization', `Bearer ${IT_ADMIN()}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
      expect(service.updateCategory).toHaveBeenCalledWith('tenant-123', 1, { name: 'Updated' });
    });
  });

  describe('DELETE /api/discipline-handbook/categories/:id', () => {
    it('should delete a category', async () => {
      const res = await request(app)
        .delete('/api/discipline-handbook/categories/1')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
      expect(service.deleteCategory).toHaveBeenCalledWith('tenant-123', 1);
    });
  });

  // ─── Education Levels ────────────────────────────────────────────────────

  describe('GET /api/discipline-handbook/levels', () => {
    it('should list education levels', async () => {
      const rows = [{ id: 3, name: 'SMP-SMA' }];
      (service.listEducationLevels as any).mockResolvedValue(rows);

      const res = await request(app)
        .get('/api/discipline-handbook/levels')
        .set('Authorization', `Bearer ${COUNSELOR()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(rows);
    });
  });

  describe('POST /api/discipline-handbook/levels', () => {
    it('should create an education level as IT_ADMIN', async () => {
      const body = { name: 'SMP-SMA' };
      (service.createEducationLevel as any).mockResolvedValue({ id: 5, ...body });

      const res = await request(app)
        .post('/api/discipline-handbook/levels')
        .set('Authorization', `Bearer ${IT_ADMIN()}`)
        .send(body);

      // Route passes 201 as sendSuccess's `meta` arg, so status stays 200.
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(5);
      expect(service.createEducationLevel).toHaveBeenCalledWith('tenant-123', body);
    });

    // requireRole throws UnauthorizedError, so a disallowed role yields 401 (not 403).
    it('should reject COUNSELOR (IT_ADMIN only)', async () => {
      const res = await request(app)
        .post('/api/discipline-handbook/levels')
        .set('Authorization', `Bearer ${COUNSELOR()}`)
        .send({ name: 'X' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(service.createEducationLevel).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/discipline-handbook/levels')
        .send({ name: 'X' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/discipline-handbook/levels/:id', () => {
    it('should update an education level', async () => {
      (service.updateEducationLevel as any).mockResolvedValue({ id: 5, name: 'Baru' });

      const res = await request(app)
        .put('/api/discipline-handbook/levels/5')
        .set('Authorization', `Bearer ${IT_ADMIN()}`)
        .send({ name: 'Baru' });

      expect(res.status).toBe(200);
      expect(service.updateEducationLevel).toHaveBeenCalledWith('tenant-123', 5, { name: 'Baru' });
    });
  });

  describe('DELETE /api/discipline-handbook/levels/:id', () => {
    it('should delete an education level', async () => {
      const res = await request(app)
        .delete('/api/discipline-handbook/levels/5')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
      expect(service.deleteEducationLevel).toHaveBeenCalledWith('tenant-123', 5);
    });
  });

  // ─── Behavior Groups ─────────────────────────────────────────────────────

  describe('GET /api/discipline-handbook/groups', () => {
    it('should list behavior groups with optional category filter', async () => {
      (service.listBehaviorGroups as any).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/discipline-handbook/groups?category_id=7')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(service.listBehaviorGroups).toHaveBeenCalledWith('tenant-123', 7);
    });
  });

  describe('POST /api/discipline-handbook/groups', () => {
    it('should create a behavior group', async () => {
      const body = { category_id: 7, name: 'Fisik' };
      (service.createBehaviorGroup as any).mockResolvedValue({ id: 8, ...body });

      const res = await request(app)
        .post('/api/discipline-handbook/groups')
        .set('Authorization', `Bearer ${COUNSELOR()}`)
        .send(body);

      // Route passes 201 as sendSuccess's `meta` arg, so status stays 200.
      expect(res.status).toBe(200);
      expect(service.createBehaviorGroup).toHaveBeenCalledWith('tenant-123', body);
    });

    // requireRole throws UnauthorizedError, so a disallowed role yields 401 (not 403).
    it('should reject TEACHER', async () => {
      const res = await request(app)
        .post('/api/discipline-handbook/groups')
        .set('Authorization', `Bearer ${TEACHER()}`)
        .send({ category_id: 7, name: 'Fisik' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/discipline-handbook/groups/:id', () => {
    it('should delete a behavior group', async () => {
      const res = await request(app)
        .delete('/api/discipline-handbook/groups/8')
        .set('Authorization', `Bearer ${COUNSELOR()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
      expect(service.deleteBehaviorGroup).toHaveBeenCalledWith('tenant-123', 8);
    });
  });

  // ─── Behavior Details ────────────────────────────────────────────────────

  describe('GET /api/discipline-handbook/behaviors', () => {
    it('should list behavior details with optional group filter', async () => {
      (service.listBehaviorDetails as any).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/discipline-handbook/behaviors?group_id=8')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(service.listBehaviorDetails).toHaveBeenCalledWith('tenant-123', 8);
    });
  });

  describe('POST /api/discipline-handbook/behaviors', () => {
    it('should create a behavior detail and set its levels', async () => {
      (service.createBehaviorDetail as any).mockResolvedValue({ id: 10, group_id: 8, behavior_text: 'Mencaci' });

      const res = await request(app)
        .post('/api/discipline-handbook/behaviors')
        .set('Authorization', `Bearer ${COUNSELOR()}`)
        .send({ group_id: 8, behavior_text: 'Mencaci', level_ids: [1, 2] });

      // Route passes 201 as sendSuccess's `meta` arg, so status stays 200.
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(10);
      // level_ids must be stripped from the behavior payload
      expect(service.createBehaviorDetail).toHaveBeenCalledWith('tenant-123', {
        group_id: 8,
        behavior_text: 'Mencaci',
      });
      expect(service.setBehaviorLevels).toHaveBeenCalledWith('tenant-123', 10, [1, 2]);
    });

    it('should not call setBehaviorLevels when level_ids is absent', async () => {
      (service.createBehaviorDetail as any).mockResolvedValue({ id: 11 });

      const res = await request(app)
        .post('/api/discipline-handbook/behaviors')
        .set('Authorization', `Bearer ${COUNSELOR()}`)
        .send({ group_id: 8, behavior_text: 'Terlambat' });

      expect(res.status).toBe(200);
      expect(service.setBehaviorLevels).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/discipline-handbook/behaviors')
        .send({ group_id: 8, behavior_text: 'X' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/discipline-handbook/behaviors/:id/levels', () => {
    it('should set levels and return the resulting levels', async () => {
      (service.getBehaviorLevels as any).mockResolvedValue([{ level_id: 2 }]);

      const res = await request(app)
        .put('/api/discipline-handbook/behaviors/10/levels')
        .set('Authorization', `Bearer ${IT_ADMIN()}`)
        .send({ level_ids: [2] });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ levels: [{ level_id: 2 }] });
      expect(service.setBehaviorLevels).toHaveBeenCalledWith('tenant-123', 10, [2]);
      expect(service.getBehaviorLevels).toHaveBeenCalledWith('tenant-123', 10);
    });
  });

  describe('DELETE /api/discipline-handbook/behaviors/:id', () => {
    it('should delete a behavior detail', async () => {
      const res = await request(app)
        .delete('/api/discipline-handbook/behaviors/10')
        .set('Authorization', `Bearer ${COUNSELOR()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
      expect(service.deleteBehaviorDetail).toHaveBeenCalledWith('tenant-123', 10);
    });
  });

  // ─── Handling / Consequence Guidelines & Required Documents ──────────────

  describe('guidelines endpoints', () => {
    it('GET /guidelines should list with parsed filters', async () => {
      (service.listHandlingGuidelines as any).mockResolvedValue([{ id: 1 }]);

      const res = await request(app)
        .get('/api/discipline-handbook/guidelines?category_id=1&level_id=3')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: 1 }]);
      expect(service.listHandlingGuidelines).toHaveBeenCalledWith('tenant-123', 1, 3);
    });

    it('POST /guidelines should create', async () => {
      const body = { behavior_id: 10, guideline: 'Panggil orang tua' };
      (service.createHandlingGuideline as any).mockResolvedValue({ id: 1, ...body });

      const res = await request(app)
        .post('/api/discipline-handbook/guidelines')
        .set('Authorization', `Bearer ${COUNSELOR()}`)
        .send(body);

      // Route passes 201 as sendSuccess's `meta` arg, so status stays 200.
      expect(res.status).toBe(200);
      expect(service.createHandlingGuideline).toHaveBeenCalledWith('tenant-123', body);
    });

    it('PUT /guidelines/:id should update', async () => {
      (service.updateHandlingGuideline as any).mockResolvedValue({ id: 1, guideline: 'Baru' });

      const res = await request(app)
        .put('/api/discipline-handbook/guidelines/1')
        .set('Authorization', `Bearer ${IT_ADMIN()}`)
        .send({ guideline: 'Baru' });

      expect(res.status).toBe(200);
      expect(service.updateHandlingGuideline).toHaveBeenCalledWith('tenant-123', 1, { guideline: 'Baru' });
    });

    it('DELETE /guidelines/:id should delete', async () => {
      const res = await request(app)
        .delete('/api/discipline-handbook/guidelines/1')
        .set('Authorization', `Bearer ${COUNSELOR()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
      expect(service.deleteHandlingGuideline).toHaveBeenCalledWith('tenant-123', 1);
    });

    // requireRole throws UnauthorizedError, so a disallowed role yields 401 (not 403).
    it('POST /guidelines should reject TEACHER', async () => {
      const res = await request(app)
        .post('/api/discipline-handbook/guidelines')
        .set('Authorization', `Bearer ${TEACHER()}`)
        .send({ behavior_id: 10, guideline: 'X' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(service.createHandlingGuideline).not.toHaveBeenCalled();
    });
  });

  describe('consequences endpoints', () => {
    it('GET /consequences should list with parsed filters', async () => {
      (service.listConsequenceGuidelines as any).mockResolvedValue([{ id: 2 }]);

      const res = await request(app)
        .get('/api/discipline-handbook/consequences?category_id=1&level_id=3')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: 2 }]);
      expect(service.listConsequenceGuidelines).toHaveBeenCalledWith('tenant-123', 1, 3);
    });

    it('POST /consequences should create', async () => {
      const body = { level_id: 3, consequence: 'Skorsing' };
      (service.createConsequenceGuideline as any).mockResolvedValue({ id: 2, ...body });

      const res = await request(app)
        .post('/api/discipline-handbook/consequences')
        .set('Authorization', `Bearer ${COUNSELOR()}`)
        .send(body);

      // Route passes 201 as sendSuccess's `meta` arg, so status stays 200.
      expect(res.status).toBe(200);
      expect(service.createConsequenceGuideline).toHaveBeenCalledWith('tenant-123', body);
    });

    it('PUT /consequences/:id should update', async () => {
      (service.updateConsequenceGuideline as any).mockResolvedValue({ id: 2, consequence: 'Baru' });

      const res = await request(app)
        .put('/api/discipline-handbook/consequences/2')
        .set('Authorization', `Bearer ${IT_ADMIN()}`)
        .send({ consequence: 'Baru' });

      expect(res.status).toBe(200);
      expect(service.updateConsequenceGuideline).toHaveBeenCalledWith('tenant-123', 2, { consequence: 'Baru' });
    });

    it('DELETE /consequences/:id should delete', async () => {
      const res = await request(app)
        .delete('/api/discipline-handbook/consequences/2')
        .set('Authorization', `Bearer ${COUNSELOR()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
      expect(service.deleteConsequenceGuideline).toHaveBeenCalledWith('tenant-123', 2);
    });
  });

  describe('documents endpoints', () => {
    it('GET /documents should list with parsed filters', async () => {
      (service.listRequiredDocuments as any).mockResolvedValue([{ id: 3 }]);

      const res = await request(app)
        .get('/api/discipline-handbook/documents?category_id=1&level_id=3')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: 3 }]);
      expect(service.listRequiredDocuments).toHaveBeenCalledWith('tenant-123', 1, 3);
    });

    it('POST /documents should create', async () => {
      const body = { name: 'Surat pernyataan' };
      (service.createRequiredDocument as any).mockResolvedValue({ id: 3, ...body });

      const res = await request(app)
        .post('/api/discipline-handbook/documents')
        .set('Authorization', `Bearer ${COUNSELOR()}`)
        .send(body);

      // Route passes 201 as sendSuccess's `meta` arg, so status stays 200.
      expect(res.status).toBe(200);
      expect(service.createRequiredDocument).toHaveBeenCalledWith('tenant-123', body);
    });

    it('PUT /documents/:id should update', async () => {
      (service.updateRequiredDocument as any).mockResolvedValue({ id: 3, name: 'Baru' });

      const res = await request(app)
        .put('/api/discipline-handbook/documents/3')
        .set('Authorization', `Bearer ${IT_ADMIN()}`)
        .send({ name: 'Baru' });

      expect(res.status).toBe(200);
      expect(service.updateRequiredDocument).toHaveBeenCalledWith('tenant-123', 3, { name: 'Baru' });
    });

    it('DELETE /documents/:id should delete', async () => {
      const res = await request(app)
        .delete('/api/discipline-handbook/documents/3')
        .set('Authorization', `Bearer ${COUNSELOR()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
      expect(service.deleteRequiredDocument).toHaveBeenCalledWith('tenant-123', 3);
    });

    // requireRole throws UnauthorizedError, so a disallowed role yields 401 (not 403).
    it('PUT /documents/:id should reject TEACHER', async () => {
      const res = await request(app)
        .put('/api/discipline-handbook/documents/3')
        .set('Authorization', `Bearer ${TEACHER()}`)
        .send({ name: 'X' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Export / Import ─────────────────────────────────────────────────────

  describe('GET /api/discipline-handbook/export', () => {
    it('should export all handbook data', async () => {
      const data = { categories: [], levels: [] };
      (service.exportHandbookData as any).mockResolvedValue(data);

      const res = await request(app)
        .get('/api/discipline-handbook/export')
        .set('Authorization', `Bearer ${IT_ADMIN()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(data);
      expect(service.exportHandbookData).toHaveBeenCalledWith('tenant-123');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/discipline-handbook/export');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/discipline-handbook/import', () => {
    it('should import handbook data from the request body', async () => {
      const body = { categories: [{ name: 'Baru' }] };
      (service.importHandbookData as any).mockResolvedValue({ imported: 1 });

      const res = await request(app)
        .post('/api/discipline-handbook/import')
        .set('Authorization', `Bearer ${IT_ADMIN()}`)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ imported: 1 });
      expect(service.importHandbookData).toHaveBeenCalledWith('tenant-123', body);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/discipline-handbook/import')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
