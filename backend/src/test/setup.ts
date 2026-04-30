import { vi } from 'vitest';

// Mock PostgreSQL Pool
vi.mock('pg', () => {
  const mClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
const mPool = {
    connect: vi.fn().mockResolvedValue(mClient),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
    on: vi.fn(),
  };
  const mAuditPool = {
    connect: vi.fn().mockResolvedValue(mClient),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
    on: vi.fn(),
  };
  class Pool {
    constructor() { 
      if (process.env.DATABASE_AUDIT_URL) {
        return mAuditPool;
      }
      return mPool; 
    }
  }
  return { Pool, default: { Pool } };
});

// Mock db/pool.js exports - COMPLETE mock with all exports and methods
vi.mock('../db/pool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/pool.js')>();
  return {
    ...actual,
    pool: {
      ...actual.pool,
      query: vi.fn().mockImplementation((queryText: string, params?: any[]) => {
        if (queryText?.includes('SELECT tenant_id FROM tenants') && params?.[0] === 'tenant-123') {
          return { rows: [{ tenant_id: 'tenant-123' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
    },
    auditPool: {
      ...actual.auditPool,
      query: vi.fn().mockResolvedValue({ rows: [] }),
    },
    getClientWithTenant: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ tenant_id: 'tenant-123' }] }),
      release: vi.fn(),
    }),
    queryWithTenant: vi.fn().mockResolvedValue({ rows: [] }),
    closePool: vi.fn(),
  };
});

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
  compare: vi.fn().mockResolvedValue(true),
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  }
}));

// Mock Redis
vi.mock('ioredis', () => {
  const mRedis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  };
  class Redis {
    constructor() { return mRedis; }
  }
  return { default: Redis };
});

// Mock AWS S3
vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    constructor() {
      return { send: vi.fn() };
    }
  }
  return {
    S3Client,
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    getSignedUrl: vi.fn().mockResolvedValue('https://mocked-s3-url.com/file'),
  };
});

// Mock service functions globally with vi.fn() to allow per-test configuration
vi.mock('../services/media.service.js', () => ({
  createPresignedUpload: vi.fn(),
  linkAsset: vi.fn(),
  triggerRedaction: vi.fn(),
  getAssetDownloadUrl: vi.fn(),
  listAssetsForCase: vi.fn(),
  default: {
    createPresignedUpload: vi.fn(),
    linkAsset: vi.fn(),
    triggerRedaction: vi.fn(),
    getAssetDownloadUrl: vi.fn(),
    listAssetsForCase: vi.fn(),
  }
}));

vi.mock('../services/positive-observations.service.js', () => ({
  createObservation: vi.fn(),
  listObservationsByStudent: vi.fn(),
  default: {
    createObservation: vi.fn(),
    listObservationsByStudent: vi.fn(),
  }
}));

vi.mock('../services/students.service.js', () => ({
  getStudentTimeline: vi.fn(),
  default: {
    getStudentTimeline: vi.fn(),
  }
}));

vi.mock('../services/reports.service.js', () => ({
  generateStudentReport: vi.fn(),
  getReportUrl: vi.fn(),
  default: {
    generateStudentReport: vi.fn(),
    getReportUrl: vi.fn(),
  }
}));

vi.mock('../services/auth.service.js', () => {
  const mockAuthService = {
    login: vi.fn(),
    refreshAccessToken: vi.fn(),
    revokeAllTokens: vi.fn(),
    hashPassword: vi.fn(),
  };
  return {
    ...mockAuthService,
    authService: mockAuthService,
    default: mockAuthService,
  };
});

// Avoid actual cron scheduling in tests
vi.mock('node-cron', () => {
  return {
    default: {
      schedule: vi.fn()
    }
  };
});

