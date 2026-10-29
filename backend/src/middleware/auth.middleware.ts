import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';
import type { JwtPayload } from '@swims/shared';

/**
 * Middleware: Verify JWT access token from Authorization header.
 * Attaches userId, tenantId, userRole, and full jwtPayload to req.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    req.userId = payload.user_id;
    req.tenantId = payload.tenant_id;
    req.userRole = payload.role;
    req.jwtPayload = payload;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Token expired'));
    }
    return next(new UnauthorizedError('Invalid token'));
  }
}

/**
 * Middleware: Verify JWT access token if present, but never reject. Attaches
 * userId/tenantId/userRole when a valid Bearer token is sent; anonymous
 * requests pass through untouched. Used by public routes that want to
 * attribute the action to a logged-in user when one happens to be calling.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as JwtPayload;
    req.userId = payload.user_id;
    req.tenantId = payload.tenant_id;
    req.userRole = payload.role;
    req.jwtPayload = payload;
  } catch {
    // Invalid/expired token on a public route: treat as anonymous, not an error.
  }
  next();
}

/**
 * Middleware factory: require one of the given roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = (req as any).userRole;
    if (!role || !allowedRoles.includes(role)) {
      return next(new UnauthorizedError('Insufficient permissions'));
    }
    next();
  };
}
