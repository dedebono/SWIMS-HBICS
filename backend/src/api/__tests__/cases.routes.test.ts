import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { app } from '../../index.js';
import { pool, getClientWithTenant } from '../../db/pool.js';


describe('POST /api/cases', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (pool.query as any).mockImplementation((queryStr: string, values: any) => mockClient.query(queryStr, values));
    (pool.connect as any).mockResolvedValue(mockClient);
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  it('should allow TEACHER to create a case', async () => {
    const token = generateTestToken('tenant-1', 'user-1', 'TEACHER');

    mockClient.query.mockImplementation((queryStr: string) => {
      if (queryStr.includes('BEGIN') || queryStr.includes('COMMIT') || queryStr.includes('ROLLBACK') || queryStr.includes('SET LOCAL')) {
        return Promise.resolve({});
      }
      if (queryStr.includes('INSERT INTO cases')) {
        return Promise.resolve({ rows: [{ case_id: 'case-123', status: 'OPEN', risk_level: 'LOW' }] });
      }
      if (queryStr.includes('SELECT tenant_id FROM tenants')) {
        return Promise.resolve({ rows: [{ tenant_id: 'tenant-1' }] });
      }
      if (queryStr.includes('teacher_class_assignments')) {
        return Promise.resolve({ rows: [{ count: '1' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student_id: '123e4567-e89b-12d3-a456-426614174000',
        case_type: 'BEHAVIORAL',
        summary: 'Testing case creation'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.case_id).toBe('case-123');
  });

  it('should prevent unauthenticated access', async () => {
    const res = await request(app)
      .post('/api/cases')
      .send({
        student_id: '123e4567-e89b-12d3-a456-426614174000',
        case_type: 'BEHAVIORAL'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
