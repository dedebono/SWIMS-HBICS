import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';

import { pool, getClientWithTenant } from '../../db/pool.js';


describe('POST /api/onboarding/register', () => {
  let mockClient: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Setup typical successful DB mock
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    
    (pool.query as any).mockImplementation((queryStr: string, values: any) => mockClient.query(queryStr, values));
    (pool.connect as any).mockResolvedValue(mockClient);
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  it('should successfully register a new tenant and admin user', async () => {
    mockClient.query.mockImplementation((queryStr: string) => {
      if (queryStr.includes('BEGIN')) return Promise.resolve({});
      if (queryStr.includes('COMMIT')) return Promise.resolve({});
      if (queryStr.includes('ROLLBACK')) return Promise.resolve({});
      if (queryStr.includes('slug = $1')) return Promise.resolve({ rowCount: 0, rows: [] });
      if (queryStr.includes('email = $1')) return Promise.resolve({ rowCount: 0, rows: [] });
      if (queryStr.includes('INSERT INTO tenants')) return Promise.resolve({ rows: [{ tenant_id: 'tenant-123' }] });
      if (queryStr.includes('INSERT INTO users')) return Promise.resolve({ rows: [{ user_id: 'user-123' }] });
      return Promise.resolve({});
    });

    const res = await request(app)
      .post('/api/onboarding/register')
      .send({
        tenant_name: 'Test Academy',
        slug: 'test-academy',
        admin_name: 'Admin User',
        admin_email: 'admin@testacademy.com',
        admin_password: 'SecurePassword123!'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tenantId).toBe('tenant-123');
    expect(res.body.data.userId).toBe('user-123');
    
    // Ensure BEGIN and COMMIT were called
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('should fail if tenant slug already exists', async () => {
    // 1. SELECT tenant_id FROM tenants WHERE slug = $1 (Match found)
    mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ tenant_id: 'existing-tenant' }] });

    const res = await request(app)
      .post('/api/onboarding/register')
      .send({
        tenant_name: 'Test Academy',
        slug: 'test-academy',
        admin_name: 'Admin User',
        admin_email: 'admin@testacademy.com',
        admin_password: 'SecurePassword123!'
      });

    expect(res.status).toBe(500); // Because it throws an error in service that is caught by asyncHandler -> 500 or 400 depending on error handler
    expect(res.body.success).toBe(false);
    
    // Ensure ROLLBACK was called
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
