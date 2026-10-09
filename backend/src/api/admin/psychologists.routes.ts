import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../../middleware/error-handler.middleware.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { setTenantContext } from '../../middleware/tenant.middleware.js';
import { pool, queryWithTenant } from '../../db/pool.js';
import type { SchoolPsychologistRow } from '@swims/shared';
import { sendSuccess, sendCreated, sendError } from '../../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

/**
 * GET /api/admin/psychologists
 *
 * Driven off `users` (role = PSYCHOLOGIST), LEFT JOINed to the referral profile
 * in `school_psychologists`. `users` is the source of truth for "who is a
 * psychologist" — reading only `school_psychologists` hid every account created
 * through user management, which is why the list came back empty.
 */
router.get('/', requireRole('IT_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const tenantId = (req as any).tenantId;
  const { rows } = await queryWithTenant<SchoolPsychologistRow & { email: string | null }>(
    tenantId,
    `SELECT
       COALESCE(sp.psychologist_id, u.user_id) AS psychologist_id,
       u.user_id,
       COALESCE(sp.full_name, u.full_name)   AS full_name,
       u.email,
       COALESCE(sp.expertise, 'Belum diisi')  AS expertise,
       COALESCE(sp.consultation_fee, 0)      AS consultation_fee,
       sp.photo_url,
       COALESCE(sp.is_active, u.is_active, true) AS is_active,
       COALESCE(sp.created_at, u.created_at) AS created_at,
       COALESCE(sp.updated_at, u.created_at) AS updated_at,
       (sp.psychologist_id IS NOT NULL)      AS has_profile
     FROM users u
     LEFT JOIN school_psychologists sp
            ON sp.user_id = u.user_id
           AND sp.tenant_id = u.tenant_id
           AND sp.deleted_at IS NULL
     WHERE u.tenant_id = $1
       AND u.role = 'PSYCHOLOGIST'
       AND u.deleted_at IS NULL
     ORDER BY COALESCE(sp.full_name, u.full_name) ASC`,
    [tenantId],
  );
  sendSuccess(res, rows);
}));

/**
 * POST /api/admin/psychologists
 *
 * Creates the login account AND the referral profile in one call, so a
 * psychologist added here is immediately able to sign in and be recommended
 * to students.
 */
router.post('/', requireRole('IT_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const tenantId = (req as any).tenantId;
  const { full_name, email, password, expertise, consultation_fee, photo_url } = req.body as any;

  if (!full_name || !expertise || consultation_fee == null) {
    return sendError(res, 'full_name, expertise, consultation_fee wajib diisi', 400);
  }
  if (!email) {
    return sendError(res, 'email wajib diisi untuk membuat akun psikolog', 400);
  }

  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

    const { rows: dupe } = await client.query(
      `SELECT 1 FROM users WHERE tenant_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL`,
      [tenantId, email],
    );
    if (dupe.length > 0) {
      return sendError(res, `Email ${email} sudah digunakan akun lain`, 409);
    }

    const passwordHash = await bcrypt.hash(password || Math.random().toString(36).slice(2), 12);

    await client.query('BEGIN');
    const { rows: userRows } = await client.query<{ user_id: string }>(
      `INSERT INTO users (tenant_id, full_name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, 'PSYCHOLOGIST', true)
       RETURNING user_id`,
      [tenantId, full_name, email, passwordHash],
    );
    const userId = userRows[0]?.user_id;
    if (!userId) throw new Error('Gagal membuat akun psikolog');

    const { rows: profileRows } = await client.query<SchoolPsychologistRow>(
      `INSERT INTO school_psychologists (tenant_id, user_id, full_name, expertise, consultation_fee, photo_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [tenantId, userId, full_name, expertise, consultation_fee, photo_url ?? null],
    );
    await client.query('COMMIT');

    sendCreated(res, { ...profileRows[0], email, user_id: userId, has_profile: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * PUT /api/admin/psychologists?id=
 *
 * `id` may be either the profile id or the linked user_id — the GET list is
 * keyed on COALESCE(psychologist_id, user_id), so accept both.
 */
router.put('/', requireRole('IT_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const tenantId = (req as any).tenantId;
  const id = req.query.id as string;
  if (!id) return sendError(res, 'id wajib', 400);

  const { full_name, expertise, consultation_fee, photo_url, is_active } = req.body as any;

  // Resolve the profile row from either identifier.
  const { rows: found } = await queryWithTenant<SchoolPsychologistRow & { user_id: string | null }>(
    tenantId,
    `SELECT * FROM school_psychologists
      WHERE tenant_id = $1 AND deleted_at IS NULL
        AND (psychologist_id::text = $2 OR (user_id IS NOT NULL AND user_id::text = $2))
      LIMIT 1`,
    [tenantId, id],
  );

  let profile: SchoolPsychologistRow | undefined = found[0];
  let userId: string | null = profile?.user_id ?? null;

  // Account exists but has no profile row yet → create one so the edit sticks.
  if (!profile) {
    const { rows: urows } = await queryWithTenant<{ user_id: string; full_name: string }>(
      tenantId,
      `SELECT user_id, full_name FROM users
        WHERE tenant_id = $1 AND user_id::text = $2 AND role = 'PSYCHOLOGIST' AND deleted_at IS NULL
        LIMIT 1`,
      [tenantId, id],
    );
    if (urows[0]) {
      const { rows: created } = await queryWithTenant<SchoolPsychologistRow>(
        tenantId,
        `INSERT INTO school_psychologists (tenant_id, user_id, full_name, expertise, consultation_fee, is_active)
         VALUES ($1, $2, $3, 'Belum diisi', 0, true) RETURNING *`,
        [tenantId, urows[0].user_id, urows[0].full_name],
      );
      profile = created[0];
      userId = urows[0].user_id;
    }
  }
  if (!profile) return sendError(res, 'Psikolog tidak ditemukan', 404);

  const { rows } = await queryWithTenant<SchoolPsychologistRow>(
    tenantId,
    `UPDATE school_psychologists
       SET full_name         = COALESCE($3, full_name),
           expertise         = COALESCE($4, expertise),
           consultation_fee = COALESCE($5, consultation_fee),
           photo_url         = $6,
           is_active         = COALESCE($7, is_active),
           updated_at        = now()
     WHERE psychologist_id = $2 AND tenant_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [tenantId, profile.psychologist_id, full_name, expertise, consultation_fee, photo_url ?? null, is_active],
  );
  if (!rows[0]) return sendError(res, 'Psikolog tidak ditemukan', 404);

  // Keep the account name/status in step with the profile.
  if (userId) {
    await queryWithTenant(
      tenantId,
      `UPDATE users SET full_name = COALESCE($2, full_name), is_active = COALESCE($3, is_active)
        WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId, full_name, is_active],
    );
  }

  sendSuccess(res, { ...rows[0], user_id: userId, has_profile: true });
}));

/**
 * DELETE /api/admin/psychologists?id=
 *
 * Soft-deletes the profile only. The login account is preserved so historical
 * appointments / referrals keep resolving to a real user.
 */
router.delete('/', requireRole('IT_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const tenantId = (req as any).tenantId;
  const id = req.query.id as string;
  if (!id) return sendError(res, 'id wajib', 400);

  await queryWithTenant(
    tenantId,
    `UPDATE school_psychologists
        SET deleted_at = now(), is_active = false
      WHERE tenant_id = $1 AND deleted_at IS NULL
        AND (psychologist_id::text = $2 OR (user_id IS NOT NULL AND user_id::text = $2))`,
    [tenantId, id],
  );
  sendSuccess(res, { message: 'Psikolog berhasil dihapus dari daftar rekomendasi' });
}));

export default router;