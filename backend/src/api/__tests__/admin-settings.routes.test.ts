import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool, getClientWithTenant } from '../../db/pool.js';


vi.mock('fetch', () => ({
  default: vi.fn(),
}));

vi.mock('../../services/ai-insights.service.js', () => ({
  validateAiConnection: vi.fn(),
}));

describe('Admin Settings Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('GET /api/admin/settings', () => {
    it('should allow IT_ADMIN to retrieve settings', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

      const mockSettings = {
        ai: { enabled: true, apiUrl: 'http://localhost:11434/api/generate' },
        storage: { storageProvider: 's3' }
      };

      mockClient.query.mockImplementation((queryStr: string) => {
        if (queryStr.includes('SELECT settings FROM tenants')) {
          return Promise.resolve({ rows: [{ settings: mockSettings }] });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockSettings);
    });

    it('should return empty object if no settings exist', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

      mockClient.query.mockImplementation((queryStr: string) => {
        if (queryStr.includes('SELECT settings FROM tenants')) {
          return Promise.resolve({ rows: [{}] });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({});
    });

    it('should prevent non-IT_ADMIN from accessing settings', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Only IT_ADMIN can manage settings');
    });

    it('should require authentication for settings access', async () => {
      const res = await request(app)
        .get('/api/admin/settings');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/admin/settings', () => {
    it('should allow IT_ADMIN to update AI settings', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

      const currentSettings = {
        ai: { enabled: false, apiUrl: 'http://old-url' },
        storage: { storageProvider: 's3' }
      };

      const updates = {
        ai: {
          enabled: true,
          apiUrl: 'http://localhost:11434/api/generate',
          apiKey: 'new-key'
        }
      };

      const expectedSettings = {
        ...currentSettings,
        ai: { enabled: true, apiUrl: 'http://localhost:11434/api/generate', apiKey: 'new-key' }
      };

      mockClient.query.mockImplementation((queryStr: string, values: any) => {
        if (queryStr.includes('SELECT settings FROM tenants')) {
          return Promise.resolve({ rows: [{ settings: currentSettings }] });
        }
        if (queryStr.includes('BEGIN')) {
          return Promise.resolve({});
        }
        if (queryStr.includes('UPDATE tenants')) {
          return Promise.resolve({});
        }
        if (queryStr.includes('COMMIT')) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${token}`)
        .send(updates);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(expectedSettings);
    });

    it('should allow IT_ADMIN to update storage settings', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

      const currentSettings = {
        storage: { storageProvider: 's3' }
      };

      const updates = {
        storage: {
          storageProvider: 'firebase',
          firebaseApiKey: 'firebase-key',
          firebaseProjectId: 'my-project'
        }
      };

      mockClient.query.mockImplementation((queryStr: string) => {
        if (queryStr.includes('SELECT settings FROM tenants')) {
          return Promise.resolve({ rows: [{ settings: currentSettings }] });
        }
        if (queryStr.includes('UPDATE tenants')) {
          return Promise.resolve({});
        }
        if (queryStr.includes('COMMIT')) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${token}`)
        .send(updates);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.storage.storageProvider).toBe('firebase');
    });

    it('should rollback transaction on error', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

      mockClient.query.mockImplementation((queryStr: string) => {
        if (queryStr.includes('SELECT settings FROM tenants')) {
          return Promise.resolve({ rows: [{ settings: {} }] });
        }
        if (queryStr.includes('BEGIN')) {
          return Promise.resolve({});
        }
        // Simulate error on UPDATE
        if (queryStr.includes('UPDATE tenants')) {
          throw new Error('Database error');
        }
        return Promise.resolve({});
      });

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ ai: { enabled: true } });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should prevent non-IT_ADMIN from updating settings', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ ai: { enabled: true } });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/admin/ai/check-connection', () => {
    it('should allow IT_ADMIN to test AI connection', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

      // Mock fetch globally
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        statusText: 'OK'
      });

      const res = await request(app)
        .post('/api/admin/ai/check-connection')
        .set('Authorization', `Bearer ${token}`)
        .send({
          apiUrl: 'http://localhost:11434/api/generate',
          apiKey: 'test-key'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connected).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-key',
          'Content-Type': 'application/json'
        }
      });
    });

    it('should return error if AI connection fails', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

      global.fetch = vi.fn().mockRejectedValue(new Error('Network Error'));

      const res = await request(app)
        .post('/api/admin/ai/check-connection')
        .set('Authorization', `Bearer ${token}`)
        .send({
          apiUrl: 'http://localhost:11434/api/generate',
          apiKey: 'test-key'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Network Error');
    });

    it('should prevent non-IT_ADMIN from testing AI connection', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

      const res = await request(app)
        .post('/api/admin/ai/check-connection')
        .set('Authorization', `Bearer ${token}`)
        .send({
          apiUrl: 'http://localhost:11434/api/generate',
          apiKey: 'test-key'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
