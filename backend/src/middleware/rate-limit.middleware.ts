import type { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { RateLimitError } from '../utils/errors.js';

const redis = new Redis(env.REDIS_URL);

interface RateLimitOptions {
  windowMs: number;    // time window in milliseconds
  maxAttempts: number; // max requests within window
  keyPrefix: string;   // Redis key prefix
}

/**
 * Redis-backed sliding window rate limiter.
 * Keyed by IP address.
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxAttempts, keyPrefix } = options;
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${keyPrefix}:${ip}`;

    try {
      const current = await redis.incr(key);

      if (current === 1) {
        // First request — set expiry
        await redis.expire(key, windowSec);
      }

      if (current > maxAttempts) {
        const ttl = await redis.ttl(key);
        return next(new RateLimitError(ttl > 0 ? ttl : windowSec));
      }

      next();
    } catch {
      // If Redis is down, allow the request (fail-open for rate limiting)
      next();
    }
  };
}

/**
 * Pre-configured rate limiter for login endpoint.
 * Max 5 failed attempts per 15 minutes per IP.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 5,
  keyPrefix: 'rl:login',
});

/**
 * Global rate limiter for all API endpoints.
 * Max 1000 requests per 15 minutes per IP.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 1000,
  keyPrefix: 'rl:global',
});

