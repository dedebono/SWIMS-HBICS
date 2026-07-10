import { config } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env from monorepo root (one level up from backend package root)
config({ path: path.resolve(process.cwd(), '..', '.env') });

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_AUDIT_URL: z.string().url().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('8h'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(64, 'ENCRYPTION_KEY must be a 32-byte hex string (64 chars)'),

  // S3 / MinIO
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('swims_minio'),
  S3_SECRET_KEY: z.string().default('swims_minio_password'),
  S3_BUCKET: z.string().default('swims-media'),
  S3_REGION: z.string().default('us-east-1'),

  // App
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // In test environment, return partial env with defaults instead of exiting
    if (process.env.NODE_ENV === 'test') {
      console.warn('⚠️  Using test environment with missing vars - providing defaults');
      return {
        DATABASE_URL: 'postgresql://test:test@localhost:5432/swims_test',
        DATABASE_AUDIT_URL: undefined,
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: 'test_jwt_secret_12345678901234567890',
        JWT_REFRESH_SECRET: 'test_refresh_secret_12345678901234567890',
        JWT_ACCESS_EXPIRY: '8h',
        JWT_REFRESH_EXPIRY: '7d',
        ENCRYPTION_KEY: 'test_encryption_key_123456789012345678901234567890123456789012345678901234567890',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_ACCESS_KEY: 'swims_minio',
        S3_SECRET_KEY: 'swims_minio_password',
        S3_BUCKET: 'swims-media',
        S3_REGION: 'us-east-1',
        PORT: 4000,
        NODE_ENV: 'test',
        FRONTEND_URL: 'http://localhost:3000',
        ALLOWED_ORIGINS: 'http://localhost:3000',
      } as Env;
    }
    console.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
