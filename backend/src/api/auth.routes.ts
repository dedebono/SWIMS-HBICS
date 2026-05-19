import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

// ─── Validation Schemas ──────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant_slug: z.string().min(1),
  captcha_id: z.string().min(1),
  captcha_answer: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
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

    sendSuccess(res, {
      access_token: result.tokens.accessToken,
      refresh_token: result.tokens.refreshToken,
      user: result.user,
    });
  }),
);

// ─── POST /api/auth/refresh ──────────────────────────────────────────────────

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const body = refreshSchema.parse(req.body);
    const tokens = await authService.refreshAccessToken(body.refresh_token);

    sendSuccess(res, {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
  }),
);

// ─── POST /api/auth/logout ──────────────────────────────────────────────────

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.revokeAllTokens(req.userId);
    sendSuccess(res, { message: 'Logged out successfully' });
  }),
);

export default router;
