import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { executeRightToBeForgotten } from '../services/rtbf.service.js';
import { exportData, importData } from '../services/data-migration.service.js';
import {
  getTenantPermissionMatrix,
  getRolePermissions,
  setRolePermissions,
  resetRolePermissions,
} from '../services/role-permissions.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { pool } from '../db/pool.js';
import { hashNationalId, encryptField, decryptField } from '../utils/encryption.js';
import type { UserRow } from '@swims/shared';
import { RESOURCE_NAMES, ACTION_NAMES, ACCOUNT_ROLE_NAMES, ROLE_NAMES, getAccountRoleTarget, STUDENT } from '@swims/shared';

const router = Router();

/**
 * Destructure the shared role list into a tuple zod's `z.enum` accepts, so the
 * create/edit forms and request validation can never drift from
 * `shared/types/database.ts`.
 */
const [FIRST_ROLE, ...REMAINING_ROLES] = ACCOUNT_ROLE_NAMES;
const ACCOUNT_ROLES = [FIRST_ROLE, ...REMAINING_ROLES] as [string, ...string[]];

/**
 * Resolves which table an admin-list id belongs to.
 *
 * `GET /api/admin/users` UNIONs staff (`users`) with students (`students`), so
 * the frontend only has one opaque `id`. Looking the id up in `users` first and
 * falling back to `students` is what lets PUT/DELETE work for both — previously
 * a student id matched zero `users` rows, so edits returned 404 and deletes
 * replied `{deleted:true}` without touching anything.
 */
async function resolveAccountTable(tenantId: string, id: string): Promise<'users' | 'students' | null> {
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
  return null;
}

/** Shape a student row like a `users` row so the admin table renders one type. */
async function decorateStudent(row: any): Promise<any> {
  if (row?.national_id) {
    try { row.national_id = decryptField(row.national_id); } catch { /* keep as stored */ }
  }
  return { ...row, role: STUDENT, is_active: true, type: STUDENT };
}

/**
 * `users.password_hash` is NOT NULL with no default, so every staff row needs
 * one. When the admin does not supply a password — the normal case for a CSV
 * import — seed an unguessable random one so the account is created but cannot
 * be logged into until someone resets it. Previously the bulk endpoint omitted
 * the column entirely and every staff row in a CSV died on
 * `null value in column "password_hash"`.
 */
async function resolvePasswordHash(password?: string): Promise<string> {
  const raw = password ?? randomBytes(32).toString('hex');
  return bcrypt.hash(raw, 12);
}

// ─── Role Permission Schemas ────────────────────────────────────────────────
//
// Defined here rather than in @swims/shared/schemas because that subpath is not
// compiled by shared/tsconfig.json (rootDir is ./types, include is types/**), so
// it cannot be resolved at runtime.

/**
 * `:role` path param for the role-permission routes — the eight login roles.
 * `STUDENT` is excluded on purpose: it has no permission matrix.
 */
const [FIRST_PERM_ROLE, ...REMAINING_PERM_ROLES] = ROLE_NAMES;
const PERMISSION_ROLES = [FIRST_PERM_ROLE, ...REMAINING_PERM_ROLES] as [string, ...string[]];
const roleParamSchema = z.enum(PERMISSION_ROLES);

/**
 * Body of `PUT /api/admin/role-permissions/:role` — a permission-matrix slice
 * shaped `resource → action → boolean`.
 *
 * Resource and action keys are enums (not free strings). Without this the raw
 * body was upserted verbatim into role_permissions, so a payload like
 * `{resource: "cases", action: "read", allowed: false}` was iterated as if those
 * keys were resource names and silently inserted junk rows while still replying
 * 200. Actions per resource may be partial — setRolePermissions upserts only the
 * pairs actually supplied.
 */
const rolePermissionsSchema = z
  .record(
    z.enum(RESOURCE_NAMES),
    z.record(z.enum(ACTION_NAMES), z.boolean()),
  )
  .refine((val) => Object.keys(val).length > 0, {
    message: 'at least one resource is required',
  });

router.use(authenticate, setTenantContext);

const rtbfSchema = z.object({
  student_id: z.string().uuid()
});

// ─── POST /api/admin/rtbf-request ──────────────────────────────────────────

router.post(
  '/rtbf-request',
  asyncHandler(async (req, res) => {
    // strict check: caller must be IT_ADMIN
    if (req.userRole !== 'IT_ADMIN') {
      res.status(403).json({ success: false, error: { message: "Only IT_ADMIN can execute RTBF" }});
      return;
    }

    const body = rtbfSchema.parse(req.body);

    const result = await executeRightToBeForgotten(
      req.tenantId,
      body.student_id,
      req.userId,
      req
    );

    sendSuccess(res, result);
  }),
);

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get(
  '/users',
  checkPermission('admin', 'read'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;

    // UNION: staff from users table + students from students table
    const { rows } = await pool.query<UserRow & { type: string; gender: string | null }>(
      `SELECT user_id as id, full_name, email, role,
              is_active, created_at, national_id,
              CASE WHEN role = 'STUDENT' THEN 'STUDENT' ELSE 'STAFF' END as type,
              gender
       FROM users
       WHERE tenant_id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT student_id as id, full_name,
              parent_email as email, 'STUDENT' as role,
              true as is_active, created_at, national_id,
              'STUDENT' as type,
              gender
       FROM students
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY full_name ASC`,
      [tenantId],
    );
    // Decrypt national_id values for frontend
    for (const row of rows as any[]) {
      if (row.national_id) {
        try { row.national_id = decryptField(row.national_id); } catch { /* keep encrypted */ }
      }
    }
    sendSuccess(res, rows);
  }),
);

// ─── POST /api/admin/users ───────────────────────────────────────────────────
const createUserSchema = z.object({
  full_name: z.string().min(1),
  // For STUDENT this is the parent/guardian contact (students.parent_email);
  // it is optional because a student record needs no login identity.
  email: z.string().email().optional(),
  role: z.enum(ACCOUNT_ROLES),
  password: z.string().min(6).optional(),
  national_id: z.string().optional(),
  gender: z.string().optional(),
  phone_number: z.string().optional(),
  date_of_birth: z.string().optional(),
  parent_email: z.string().email().optional(),
});

router.post(
  '/users',
  checkPermission('admin', 'create'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const body = createUserSchema.parse(req.body);

    // STUDENT is a record in `students`, not a login account: students have no
    // email or password_hash and cannot authenticate. Inserting one as a `users`
    // row used to fail on users_role_check with a raw 500.
    if (getAccountRoleTarget(body.role) === 'students') {
      const { rows } = await pool.query(
        `INSERT INTO students
           (tenant_id, full_name, gender, national_id, national_id_hash,
            parent_email, phone_number, date_of_birth)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING student_id as id, full_name, parent_email as email,
                   created_at, national_id, gender, phone_number`,
        [
          tenantId,
          body.full_name,
          body.gender ?? null,
          body.national_id ? encryptField(body.national_id) : null,
          body.national_id ? hashNationalId(body.national_id) : null,
          body.parent_email ?? body.email ?? null,
          body.phone_number ?? null,
          body.date_of_birth || null,
        ],
      );
      sendSuccess(res, await decorateStudent(rows[0]), undefined, 201);
      return;
    }

    const passwordHash = await resolvePasswordHash(body.password);
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (tenant_id, full_name, email, password_hash, role, national_id, national_id_hash, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       RETURNING user_id as id, full_name, email, role, is_active, created_at, national_id`,
      [
        tenantId,
        body.full_name,
        body.email || null,
        passwordHash,
        body.role,
        // encrypt + hash: previously this path wrote national_id as PLAINTEXT,
        // which then failed to decrypt on read and broke NIK lookup.
        body.national_id ? encryptField(body.national_id) : null,
        body.national_id ? hashNationalId(body.national_id) : null,
      ],
    );
    const row = rows[0] as any;
    if (row?.national_id) {
      try { row.national_id = decryptField(row.national_id); } catch { /* keep as stored */ }
    }
    sendSuccess(res, { ...row, type: 'STAFF' }, undefined, 201);
  }),
);

// ─── PUT /api/admin/users/:id ────────────────────────────────────────────────
const updateUserSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(ACCOUNT_ROLES).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  gender: z.string().optional(),
  phone_number: z.string().optional(),
  national_id: z.string().optional(),
  date_of_birth: z.string().optional(),
});

router.put(
  '/users/:id',
  checkPermission('admin', 'update'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const id = String(req.params.id);
    const body = updateUserSchema.parse(req.body);

    const table = await resolveAccountTable(tenantId, id);
    if (!table) { sendError(res, 'Account not found', 404); return; }

    // ── Student record ──────────────────────────────────────────────────
    // Students have no role/password/is_active columns; their `email` in the
    // admin list is the parent/guardian contact.
    if (table === 'students') {
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (body.full_name !== undefined) { sets.push(`full_name = $${idx++}`); vals.push(body.full_name); }
      if (body.email !== undefined) { sets.push(`parent_email = $${idx++}`); vals.push(body.email); }
      if (body.gender !== undefined) { sets.push(`gender = $${idx++}`); vals.push(body.gender); }
      if (body.phone_number !== undefined) { sets.push(`phone_number = $${idx++}`); vals.push(body.phone_number); }
      if (body.date_of_birth !== undefined) { sets.push(`date_of_birth = $${idx++}`); vals.push(body.date_of_birth || null); }
      if (body.national_id !== undefined) {
        sets.push(`national_id = $${idx++}`); vals.push(body.national_id ? encryptField(body.national_id) : null);
        sets.push(`national_id_hash = $${idx++}`); vals.push(body.national_id ? hashNationalId(body.national_id) : null);
      }
      if (sets.length === 0) { sendError(res, 'No fields to update', 400); return; }
      vals.push(id, tenantId);
      const { rows } = await pool.query(
        `UPDATE students SET ${sets.join(', ')}
          WHERE student_id = $${idx++} AND tenant_id = $${idx} AND deleted_at IS NULL
         RETURNING student_id as id, full_name, parent_email as email,
                   created_at, national_id, gender, phone_number`,
        vals,
      );
      if (!rows[0]) { sendError(res, 'Account not found', 404); return; }
      sendSuccess(res, await decorateStudent(rows[0]));
      return;
    }

    // ── Staff row ───────────────────────────────────────────────────────
    // A staff row can never be turned into a student in place: students live in
    // a different table with no login identity.
    if (body.role !== undefined && getAccountRoleTarget(body.role) === 'students') {
      sendError(res, 'A staff account cannot be converted to a student. Create a student instead.', 400);
      return;
    }

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (body.full_name !== undefined) { sets.push(`full_name = $${idx++}`); vals.push(body.full_name); }
    if (body.email !== undefined) { sets.push(`email = $${idx++}`); vals.push(body.email); }
    if (body.role !== undefined) { sets.push(`role = $${idx++}`); vals.push(body.role); }
    if (body.is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(body.is_active); }
    if (body.password) { sets.push(`password_hash = $${idx++}`); vals.push(await bcrypt.hash(body.password, 12)); }
    if (body.gender !== undefined) { sets.push(`gender = $${idx++}`); vals.push(body.gender); }
    // phone_number is intentionally absent: `users` has no such column (only
    // `students` does), so setting it here raised a raw SQL error. The field is
    // handled in the student branch above.
    if (body.national_id !== undefined) {
      sets.push(`national_id = $${idx++}`); vals.push(body.national_id ? encryptField(body.national_id) : null);
      sets.push(`national_id_hash = $${idx++}`); vals.push(body.national_id ? hashNationalId(body.national_id) : null);
    }

    if (sets.length === 0) {
      sendError(res, 'No fields to update', 400);
      return;
    }

    vals.push(id, tenantId);
    const { rows } = await pool.query<UserRow & { id: string }>(
      `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${idx++} AND tenant_id = $${idx} AND deleted_at IS NULL
       RETURNING user_id as id, full_name, email, role, is_active, created_at, national_id`,
      vals,
    );
    if (!rows[0]) { sendError(res, 'Account not found', 404); return; }
    const row = rows[0] as any;
    // Decrypt national_id for frontend consumption
    if (row.national_id) {
      try { row.national_id = decryptField(row.national_id); } catch { /* keep encrypted if decryption fails */ }
    }
    sendSuccess(res, { ...row, type: 'STAFF' });
  }),
);

// ─── DELETE /api/admin/users/:id ────────────────────────────────────────────
router.delete(
  '/users/:id',
  checkPermission('admin', 'delete'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const id = String(req.params.id);
    // Resolve first and verify the UPDATE actually matched a row. The old code
    // ran the UPDATE, ignored the result, and always replied {deleted:true} —
    // so deleting a student silently did nothing while reporting success.
    const table = await resolveAccountTable(tenantId, id);
    if (!table) { sendError(res, 'Account not found', 404); return; }

    const { rowCount } = await pool.query(
      table === 'students'
        ? `UPDATE students SET deleted_at = NOW() WHERE student_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`
        : `UPDATE users SET deleted_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rowCount) { sendError(res, 'Account not found', 404); return; }
    sendSuccess(res, { deleted: true, type: table === 'students' ? STUDENT : 'STAFF' });
  }),
);

// ─── POST /api/admin/users/bulk ──────────────────────────────────────────────
// Same contract as POST /users but for CSV batches: `role` is validated, and
// STUDENT rows are inserted into `students` instead of `users`.
const bulkUserSchema = z.object({
  users: z.array(z.object({
    full_name: z.string().min(1),
    email: z.string().email().optional(),
    role: z.enum(ACCOUNT_ROLES),
    // Optional: when omitted the account gets an unguessable random password
    // (users.password_hash is NOT NULL) and the admin resets it afterwards.
    password: z.string().min(6).optional(),
    national_id: z.string().optional(),
    gender: z.string().optional(),
    phone_number: z.string().optional(),
    date_of_birth: z.string().optional(),
    parent_email: z.string().email().optional(),
  })).min(1).max(1000),
});

router.post(
  '/users/bulk',
  checkPermission('admin', 'create'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const { users } = bulkUserSchema.parse(req.body);

    // One transaction for the whole batch: previously each row was inserted in
    // its own implicit transaction and a mid-batch failure left the earlier rows
    // committed, so a rejected CSV still created a partial set of accounts.
    const client = await pool.connect();
    const created: any[] = [];
    try {
      await client.query('BEGIN');
      for (const u of users) {
        if (getAccountRoleTarget(u.role) === 'students') {
          const { rows } = await client.query(
            `INSERT INTO students
               (tenant_id, full_name, gender, national_id, national_id_hash,
                parent_email, phone_number, date_of_birth)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING student_id as id, full_name, parent_email as email,
                       created_at, national_id, gender, phone_number`,
            [
              tenantId,
              u.full_name,
              u.gender ?? null,
              u.national_id ? encryptField(u.national_id) : null,
              u.national_id ? hashNationalId(u.national_id) : null,
              u.parent_email ?? u.email ?? null,
              u.phone_number ?? null,
              u.date_of_birth || null,
            ],
          );
          created.push({ ...(rows[0] as any), role: STUDENT, is_active: true, type: STUDENT });
        } else {
          const { rows } = await client.query(
            `INSERT INTO users (tenant_id, full_name, email, password_hash, role, national_id, national_id_hash, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true)
             RETURNING user_id as id, full_name, email, role, is_active, created_at, national_id`,
            [
              tenantId,
              u.full_name,
              u.email || null,
              await resolvePasswordHash(u.password),
              u.role,
              // encrypt + hash: this path previously stored national_id as
              // PLAINTEXT, unlike the manual-entry path.
              u.national_id ? encryptField(u.national_id) : null,
              u.national_id ? hashNationalId(u.national_id) : null,
            ],
          );
          created.push({ ...(rows[0] as any), type: 'STAFF' });
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    for (const r of created) {
      if (r.national_id) {
        try { r.national_id = decryptField(r.national_id); } catch { /* keep as stored */ }
      }
    }
    sendSuccess(res, {
      created: created.length,
      students: created.filter((r) => r.type === STUDENT).length,
      staff: created.filter((r) => r.type !== STUDENT).length,
      users: created,
    }, undefined, 201);
  }),
);

// ─── GET /api/admin/system-summary ───────────────────────────────────────────
router.get(
  '/system-summary',
  checkPermission('admin', 'read'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;

    const userCountsResult = await pool.query<{ totalUsers: number; activeUsers: number; inactiveUsers: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE deleted_at IS NULL) as "totalUsers",
         COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL) as "activeUsers",
         COUNT(*) FILTER (WHERE is_active = false AND deleted_at IS NULL) as "inactiveUsers"
       FROM users WHERE tenant_id = $1`,
      [tenantId],
    );
    const { totalUsers, activeUsers, inactiveUsers } = userCountsResult.rows[0] ?? { totalUsers: 0, activeUsers: 0, inactiveUsers: 0 };

    const studentResult = await pool.query<{ students: number }>(
      `SELECT COUNT(*) as students FROM students WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    const students = Number(studentResult.rows[0]?.students) || 0;

    const { rows: roleRows } = await pool.query<{ role: string; count: string }>(
      `SELECT role, COUNT(*) as count FROM users WHERE tenant_id = $1 AND deleted_at IS NULL GROUP BY role`,
      [tenantId],
    );
    const roleDistribution: Record<string, number> = {};
    for (const r of roleRows) roleDistribution[r.role] = parseInt(r.count, 10);

    sendSuccess(res, { totalUsers, activeUsers, inactiveUsers, students, roleDistribution });
  }),
);

// ─── GET /api/admin/role-permissions ────────────────────────────────────────
router.get(
  '/role-permissions',
  checkPermission('admin', 'manage'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const matrix = await getTenantPermissionMatrix(tenantId);
    sendSuccess(res, matrix);
  }),
);

// ─── GET /api/admin/role-permissions/:role ──────────────────────────────────
router.get(
  '/role-permissions/:role',
  checkPermission('admin', 'manage'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const role = roleParamSchema.parse(req.params.role);
    const slice = await getRolePermissions(tenantId, role);
    sendSuccess(res, slice);
  }),
);

// ─── PUT /api/admin/role-permissions/:role ──────────────────────────────────
router.put(
  '/role-permissions/:role',
  checkPermission('admin', 'manage'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const role = roleParamSchema.parse(req.params.role);
    // Validated, not cast: an untyped body used to be upserted verbatim into
    // role_permissions, so a malformed payload inserted junk rows and still
    // answered 200. Both parses throw ZodError -> 400 via the error handler.
    const permissions = rolePermissionsSchema.parse(req.body);
    const actorId = (req as any).userId;
    const before = await getRolePermissions(tenantId, role);
    const result = await setRolePermissions(tenantId, role, permissions, { actorId, before });
    sendSuccess(res, result);
  }),
);

// ─── POST /api/admin/role-permissions/:role/reset ───────────────────────────
router.post(
  '/role-permissions/:role/reset',
  checkPermission('admin', 'manage'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const role = roleParamSchema.parse(req.params.role);
    const actorId = (req as any).userId;
    const before = await getRolePermissions(tenantId, role);
    const result = await resetRolePermissions(tenantId, role, { actorId });
    sendSuccess(res, result);
  }),
);

// ─── GET /api/admin/export ────────────────────────────────────────────────
router.get(
  '/export',
  checkPermission('admin', 'read'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const data = await exportData(tenantId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="swims-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  }),
);

// ─── POST /api/admin/import ───────────────────────────────────────────────
router.post(
  '/import',
  checkPermission('admin', 'manage'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const result = await importData(tenantId, req.body);
    sendSuccess(res, result);
  }),
);

export default router;
