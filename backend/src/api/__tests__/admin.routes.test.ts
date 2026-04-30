import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool, getClientWithTenant } from '../../db/pool.js';

vi.mock('../../services/rtbf.service.js', () => ({
  executeRightToBeForgotten: vi.fn(),
}));

describe('POST /api/admin/rtbf-request', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (pool.query as any).mockImplementation((queryStr: string) => {
      if (queryStr.includes('SELECT tenant_id')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: 'tenant-123' }] });
      }
      return mockClient.query(queryStr);
    });
    (pool.connect as any).mockResolvedValue(mockClient);
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  it('should allow IT_ADMIN to execute RTBF request', async () => {
    const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

    mockClient.query.mockImplementation((queryStr: string) => {
      if (queryStr.includes('SELECT tenant_id')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: 'tenant-123' }] });
      }
      return Promise.resolve({ rowCount: 1, rows: [] });
    });

    const { executeRightToBeForgotten } = await import('../../services/rtbf.service.js');
    (executeRightToBeForgotten as any).mockResolvedValue({ message: 'Right to be forgotten executed successfully' });

    const res = await request(app)
      .post('/api/admin/rtbf-request')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student_id: '123e4567-e89b-12d3-a456-426614174000'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('message');
    expect(res.body.data.message).toContain('Right to be forgotten');
  });

  it('should prevent non-IT_ADMIN from executing RTBF request', async () => {
    const token = generateTestToken('tenant-123', 'user-123', 'TEACHER');

    const res = await request(app)
      .post('/api/admin/rtbf-request')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student_id: '123e4567-e89b-12d3-a456-426614174000'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Only IT_ADMIN can execute RTBF');
  });

  it('should require authentication for RTBF request', async () => {
    const res = await request(app)
      .post('/api/admin/rtbf-request')
      .send({
        student_id: '123e4567-e89b-12d3-a456-426614174000'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should validate student_id is a UUID', async () => {
    const token = generateTestToken('tenant-123', 'user-123', 'IT_ADMIN');

    const res = await request(app)
      .post('/api/admin/rtbf-request')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student_id: 'invalid-uuid'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
