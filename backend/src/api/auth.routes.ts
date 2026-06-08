import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import * as authService from '../services/auth.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { RateLimitError } from '../utils/errors.js';

const router = Router();

// ─── Rate limiting for refresh endpoint ───────────────────────────────────────
const refreshAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_REFRESH_ATTEMPTS = 20;
const REFRESH_WINDOW_MS = 15 * 60 * 1000; // 15 min

function checkRefreshRateLimit(ip: string): void {
  const now = Date.now();
  const entry = refreshAttempts.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_REFRESH_ATTEMPTS) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw new RateLimitError(retryAfter);
    }
    entry.count++;
  } else {
    refreshAttempts.set(ip, { count: 1, resetAt: now + REFRESH_WINDOW_MS });
  }
}

// ─── Validation Schemas ──────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant_slug: z.string().min(1),
  captcha_id: z.string().min(1),
  captcha_answer: z.string().min(1),
});

const refreshBodySchema = z.object({
  refresh_token: z.string().min(1).optional(),
});

// ─── GET /api/auth/captcha ───────────────────────────────────────────────────

router.get('/captcha', asyncHandler(async (req, res) => {
  const captcha = await authService.generateCaptcha();
  sendSuccess(res, captcha);
}));

// ─── POST /api/auth/login ────────────────────────────────────────────────────

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    // Verify captcha before attempting login
    await authService.verifyCaptcha(body.captcha_id, body.captcha_answer);

    const result = await authService.login(
      body.email,
      body.password,
      body.tenant_slug,
      req.ip,
    );

    // Set httpOnly cookie for refresh token (XSS protection)
    res.setHeader('Set-Cookie', authService.buildRefreshCookie(result.tokens.refreshToken));

    sendSuccess(res, {
      access_token: result.tokens.accessToken,
      user: result.user,
    });
  }),
);

// ─── POST /api/auth/refresh ──────────────────────────────────────────────────

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    checkRefreshRateLimit(ip);

    // Prefer body param (for API clients), fall back to httpOnly cookie (for browsers)
    const parsed = refreshBodySchema.safeParse(req.body);
    let refreshToken = parsed.success ? (parsed.data as { refresh_token?: string }).refresh_token : undefined;

    if (!refreshToken && req.headers.cookie) {
      const cookies = Object.fromEntries(
        req.headers.cookie.split(';').map(c => c.trim().split('='))
      );
      refreshToken = cookies['refresh_token'] ? decodeURIComponent(cookies['refresh_token']) : undefined;
    }

    if (!refreshToken) {
      sendError(res, 'Refresh token required', 400);
      return;
    }

    const tokens = await authService.refreshAccessToken(refreshToken);

    // Set httpOnly cookie for refresh token
    res.setHeader('Set-Cookie', authService.buildRefreshCookie(tokens.refreshToken));

    sendSuccess(res, {
      access_token: tokens.accessToken,
    });
  }),
);

// ─── POST /api/auth/logout ──────────────────────────────────────────────────

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.revokeAllTokens(req.userId);

    // Clear httpOnly refresh cookie
    res.setHeader('Set-Cookie', authService.buildClearRefreshCookie());

    sendSuccess(res, { message: 'Logged out successfully' });
  }),
);

export default router;
