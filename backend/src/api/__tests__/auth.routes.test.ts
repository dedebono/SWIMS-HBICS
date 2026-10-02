import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import bcrypt from 'bcryptjs';
import { pool, getClientWithTenant } from '../../db/pool.js';
import * as authService from '../../services/auth.service.js';
import { UnauthorizedError, NotFoundError } from '../../utils/errors.js';
import { createCaptcha, verifyCaptcha } from '../../services/captcha.service.js';

vi.mock('../../services/captcha.service.js', () => ({
  createCaptcha: vi.fn(() => ({ id: 'captcha-123', question: 'What is 1 + 1?' })),
  verifyCaptcha: vi.fn(() => true),
}));

vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  }
}));

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(() => 'mocked-token'),
  verify: vi.fn(() => ({ user_id: 'user-123', tenant_id: 'tenant-123', role: 'TEACHER' })),
  default: {
    sign: vi.fn(() => 'mocked-token'),
    verify: vi.fn(() => ({ user_id: 'user-123', tenant_id: 'tenant-123', role: 'TEACHER' })),
  }
}));

describe('Auth Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (pool.query as any).mockImplementation((queryStr: string) => {
      if (queryStr.includes('SELECT tenant_id FROM tenants')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: 'tenant-123' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    (pool.connect as any).mockResolvedValue(mockClient);
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate user and return tokens', async () => {
      const passwordHash = 'hashed_password';
      
      mockClient.query.mockImplementation((queryStr: string) => {
        if (queryStr.includes('SELECT tenant_id FROM tenants')) {
          return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: 'tenant-123' }] });
        }
        if (queryStr.includes('SELECT * FROM users WHERE')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{
              user_id: 'user-123',
              tenant_id: 'tenant-123',
              password_hash: passwordHash,
              role: 'TEACHER',
              is_active: true,
              full_name: 'Test Teacher'
            }]
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      (authService.login as any).mockResolvedValue({
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
        user: {
          user_id: 'user-123',
          full_name: 'Test Teacher',
          email: 'teacher@test.com',
          role: 'TEACHER',
          tenant_id: 'tenant-123',
        },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'teacher@test.com',
          password: 'CorrectPassword123!',
          tenant_slug: 'test-academy',
          captcha_id: 'captcha-123',
          captcha_answer: '2',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('access_token');
      expect(res.body.data).toHaveProperty('refresh_token');
    });

    it('should return 401 for incorrect password', async () => {
      mockClient.query.mockImplementation((queryStr: string) => {
        if (queryStr.includes('SELECT tenant_id FROM tenants')) {
          return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: 'tenant-123' }] });
        }
        if (queryStr.includes('SELECT * FROM users WHERE')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{
              user_id: 'user-123',
              tenant_id: 'tenant-123',
              password_hash: 'hashed_password',
              role: 'TEACHER',
              is_active: true
            }]
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      (authService.login as any).mockRejectedValue(new UnauthorizedError('Invalid credentials'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'teacher@test.com',
          password: 'WrongPassword!!!',
          tenant_slug: 'test-academy',
          captcha_id: 'captcha-123',
          captcha_answer: '2',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent tenant', async () => {
      mockClient.query.mockImplementation((queryStr: string) => {
        if (queryStr.includes('SELECT tenant_id FROM tenants')) {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      (authService.login as any).mockRejectedValue(new NotFoundError('Tenant', 'non-existent'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'teacher@test.com',
          password: 'Password123!',
          tenant_slug: 'non-existent',
          captcha_id: 'captcha-123',
          captcha_answer: '2',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      (authService.refreshAccessToken as any).mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({
          refresh_token: 'valid-refresh-token'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('access_token');
      expect(res.body.data).toHaveProperty('refresh_token');
    });

    it('should return 401 for invalid refresh token', async () => {
      (authService.refreshAccessToken as any).mockRejectedValue(new UnauthorizedError('Invalid refresh token'));

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({
          refresh_token: 'invalid-token'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should require refresh_token field', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should allow authenticated user to logout', async () => {
      const token = 'valid-token';
      
      (authService.revokeAllTokens as any).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(401);
    });
  });
});

