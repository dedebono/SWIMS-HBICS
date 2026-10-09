import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as avatarService from '../services/avatar.service.js';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';
import type { JwtPayload } from '@swims/shared';
import type { Request, Response } from 'express';

const router = Router();

// ─── GET /api/avatars/:id ─────────────────────────────────────────────────────
// MUST stay registered ABOVE router.use(authenticate, ...).
//
// An `<img src>` cannot send an `Authorization` header, so this route accepts
// either the HMAC-signed `?token=` (what the API hands out in `avatar_url`) or a
// plain JWT from the Authorization header for programmatic fetches.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = String(req.params['id']);
    const token = req.query['token'] as string | undefined;
    const variantRaw = (req.query['variant'] as string | undefined) ?? 'thumb';

    if (variantRaw !== 'full' && variantRaw !== 'thumb') {
      throw new UnauthorizedError('Invalid avatar variant');
    }
    const variant = variantRaw;

    let tenantId: string;

    if (token) {
      // Signed-token path: the tenant is pinned into the token's HMAC, so a
      // token minted for one school cannot be replayed against another.
      const claims = avatarService.validateAvatarToken(token);
      if (claims.variant !== variant) {
        throw new UnauthorizedError('Avatar token does not match the requested variant');
      }
      if (claims.subjectId !== accountId) {
        throw new UnauthorizedError('Avatar token does not match the requested account');
      }
      tenantId = claims.tenantId;
    } else {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Authentication required');
      }
      const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as JwtPayload;
      tenantId = payload.tenant_id;
    }

    const { Body, sizeBytes } = await avatarService.getAvatarObject(tenantId, accountId, variant);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', String(sizeBytes));
    // `private` because the bytes are tenant-scoped and served through a signed
    // URL — a shared cache must never hold them.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Body);
  }),
);

// ─── Everything below requires a JWT ──────────────────────────────────────────
router.use(authenticate);

// ─── GET /api/avatars/:id/url ────────────────────────────────────────────────
// Mint a FRESH signed URL for an account.
//
// Why this exists: the `?token=` that `GET /api/avatars/:id` accepts is good for
// one hour, but the browser keeps rendering whatever URL was handed out at login
// for the whole session (it is cached in localStorage). After the TTL lapses the
// `<img>` starts getting 401s and silently degrades to the initials fallback —
// the user's own photo vanishing an hour after they logged in.
//
// This endpoint re-mints on demand, so an expired avatar heals itself instead of
// needing a re-login. Permissions mirror the upload gate: own account, or
// `admin:update` for somebody else's.
router.get(
  '/:id/url',
  asyncHandler(async (req, res) => {
    const accountId = String(req.params['id']);
    const variantRaw = (req.query['variant'] as string | undefined) ?? 'thumb';
    if (variantRaw !== 'full' && variantRaw !== 'thumb') {
      throw new UnauthorizedError('Invalid avatar variant');
    }

    await assertCanEditAccount(req, res, accountId);

    const table = await resolveAccountTable(req.tenantId!, accountId);
    const url = await avatarService.getAvatarUrl(req.tenantId!, accountId, variantRaw);
    if (!url) {
      throw new NotFoundError('Avatar', accountId);
    }

    sendSuccess(res, { avatar_url: url, variant: variantRaw, table });
  }),
);

// Body limit is set globally (10mb) because case media needs it; the avatar
// handler re-checks the 1 MB cap on the DECODED bytes, which is the limit that
// actually matters.
const uploadSchema = z.object({
  file_data: z.string().min(1, 'file_data wajib diisi'),
  mime_type: z.string().min(1),
  file_name: z.string().optional(),
});

/** Postgres would raise `invalid input syntax for type uuid` for a malformed id,
 *  which the global handler turns into a 500 that leaks the DB error text. A bad
 *  id in the URL is a client mistake, so reject it here with a clean 404. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve which table an id belongs to — same UNION problem the admin user
 * routes face (a student id has no `users` row).
 */
async function resolveAccountTable(tenantId: string, id: string): Promise<'users' | 'students'> {
  if (!UUID_RE.test(id)) throw new NotFoundError('Account', id);

  const staff = await pool.query(
    `SELECT 1 FROM users WHERE user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId],
  );
  if (staff.rowCount) return 'users';
  const student = await pool.query(
    `SELECT 1 FROM students WHERE student_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId],
  );
  if (student.rowCount) return 'students';
  throw new NotFoundError('Account', id);
}

/**
 * Gate for "someone else's" photo. Owners skip this entirely (self-service);
 * anyone else must hold `admin:update` — the same permission the Ubah Pengguna
 * dialog already requires.
 */
function assertCanEditAccount(req: Request, res: Response, accountId: string): Promise<void> {
  if (accountId === req.userId) return Promise.resolve();
  return new Promise((resolve, reject) => {
    checkPermission('admin', 'update')(req, res, (err?: unknown) =>
      err ? reject(err) : resolve(),
    );
  });
}

// ─── POST /api/avatars/:id ────────────────────────────────────────────────────
// Upload the photo for an account.
router.post(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = String(req.params['id']);
    const table = await resolveAccountTable(req.tenantId!, accountId);
    await assertCanEditAccount(req, res, accountId);

    const body = uploadSchema.parse(req.body);
    const result = await avatarService.uploadAvatar(
      req.tenantId!,
      accountId,
      table,
      { file_data: body.file_data, mime_type: body.mime_type, file_name: body.file_name },
      req.userId!,
      req,
    );
    sendSuccess(res, result);
  }),
);

// ─── DELETE /api/avatars/:id ──────────────────────────────────────────────────
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = String(req.params['id']);
    const table = await resolveAccountTable(req.tenantId!, accountId);
    await assertCanEditAccount(req, res, accountId);

    const result = await avatarService.deleteAvatar(req.tenantId!, accountId, table, req.userId!, req);
    sendSuccess(res, result);
  }),
);

export default router;