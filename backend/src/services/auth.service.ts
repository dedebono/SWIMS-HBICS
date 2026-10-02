import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { UnauthorizedError, NotFoundError } from '../utils/errors.js';
import { auditLog } from '../utils/audit-log.js';
import type { UserRow, JwtPayload } from '@swims/shared';

const redis = new Redis(env.REDIS_URL);

const REFRESH_TOKEN_PREFIX = 'rt:';
const REFRESH_TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60; // 7 days

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface LoginResult {
  tokens: TokenPair;
  user: {
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    tenant_id: string;
  };
}

/**
 * Authenticate user with email/password, scoped by tenant slug.
 */
export async function login(
  email: string,
  password: string,
  tenantSlug: string,
  ipAddress?: string,
): Promise<LoginResult> {
  // Resolve tenant
  const { rows: tenants } = await pool.query<{ tenant_id: string }>(
    'SELECT tenant_id FROM tenants WHERE slug = $1 AND deleted_at IS NULL',
    [tenantSlug],
  );

  if (tenants.length === 0) {
    throw new NotFoundError('Tenant', tenantSlug);
  }

  const tenantId = tenants[0]!.tenant_id;

  // Find user
  const { rows: users } = await pool.query<UserRow>(
    `SELECT * FROM users
     WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL AND is_active = true`,
    [tenantId, email],
  );

  if (users.length === 0) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const user = users[0]!;

  // Verify password
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Generate tokens
  const tokens = await generateTokenPair(user.user_id, tenantId, user.role);

  // Audit log
  await auditLog({
    action: 'USER_LOGIN',
    entityType: 'users',
    entityId: user.user_id,
    tenantId,
    actorId: user.user_id,
    after: { email: user.email, ip: ipAddress },
  });

  return {
    tokens,
    user: {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      tenant_id: tenantId,
    },
  };
}

/**
 * Refresh an access token using a valid refresh token.
 * Rotates the refresh token (old one is invalidated).
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  // Verify the refresh token signature
  let payload: JwtPayload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Check if refresh token exists in Redis (not revoked)
  const key = `${REFRESH_TOKEN_PREFIX}${payload.user_id}:${refreshToken}`;
  const exists = await redis.exists(key);
  if (!exists) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  // Revoke old refresh token
  await redis.del(key);

  // Generate new token pair (rotation)
  return generateTokenPair(payload.user_id, payload.tenant_id, payload.role);
}

/**
 * Revoke all refresh tokens for a user (logout, password change, deactivation).
 */
export async function revokeAllTokens(userId: string): Promise<void> {
  const pattern = `${REFRESH_TOKEN_PREFIX}${userId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Hash a password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function generateTokenPair(
  userId: string,
  tenantId: string,
  role: string,
): Promise<TokenPair> {
  const jwtPayload = { user_id: userId, tenant_id: tenantId, role };

  const accessToken = jwt.sign(jwtPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as unknown as number,
    jwtid: uuidv4(),
  });

  const refreshToken = jwt.sign(jwtPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as unknown as number,
    jwtid: uuidv4(),
  });

  // Store refresh token in Redis for validation/revocation
  const key = `${REFRESH_TOKEN_PREFIX}${userId}:${refreshToken}`;
  await redis.set(key, '1', 'EX', REFRESH_TOKEN_EXPIRY_SEC);

  return { accessToken, refreshToken };
}

export default {
  login,
  refreshAccessToken,
  revokeAllTokens,
  hashPassword,
};

export const authService = {
  login,
  refreshAccessToken,
  revokeAllTokens,
  hashPassword,
};
