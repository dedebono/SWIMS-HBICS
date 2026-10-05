import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { executeRightToBeForgotten } from '../services/rtbf.service.js';
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

const router = Router();

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
              NULL as email, 'STUDENT' as role,
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
  email: z.string().email().optional(),
  role: z.string(),
  password: z.string().min(6).optional(),
  national_id: z.string().optional(),
  gender: z.string().optional(),
  type: z.enum(['STAFF', 'STUDENT']).default('STAFF'),
});

router.post(
  '/users',
  checkPermission('admin', 'create'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const body = createUserSchema.parse(req.body);
    const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;

    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (tenant_id, full_name, email, password_hash, role, national_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING user_id as id, full_name, email, role, is_active, created_at, national_id, 'STAFF' as type`,
      [tenantId, body.full_name, body.email || null, passwordHash, body.role, body.national_id || null],
    );
    sendSuccess(res, rows[0], undefined, 201);
  }),
);

// ─── PUT /api/admin/users/:id ────────────────────────────────────────────────
const updateUserSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  gender: z.string().optional(),
  phone_number: z.string().optional(),
  national_id: z.string().optional(),
});

router.put(
  '/users/:id',
  checkPermission('admin', 'update'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;
    const body = updateUserSchema.parse(req.body);

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (body.full_name !== undefined) { sets.push(`full_name = $${idx++}`); vals.push(body.full_name); }
    if (body.email !== undefined) { sets.push(`email = $${idx++}`); vals.push(body.email); }
    if (body.role !== undefined) { sets.push(`role = $${idx++}`); vals.push(body.role); }
    if (body.is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(body.is_active); }
    if (body.password) { sets.push(`password_hash = $${idx++}`); vals.push(await bcrypt.hash(body.password, 12)); }
    if (body.gender !== undefined) { sets.push(`gender = $${idx++}`); vals.push(body.gender); }
    if (body.phone_number !== undefined) { sets.push(`phone_number = $${idx++}`); vals.push(body.phone_number); }
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
    if (!rows[0]) { sendError(res, 'User not found', 404); return; }
    const row = rows[0] as any;
    // Decrypt national_id for frontend consumption
    if (row.national_id) {
      try { row.national_id = decryptField(row.national_id); } catch { /* keep encrypted if decryption fails */ }
    }
    sendSuccess(res, row);
  }),
);

// ─── DELETE /api/admin/users/:id ────────────────────────────────────────────
router.delete(
  '/users/:id',
  checkPermission('admin', 'delete'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;
    await pool.query(
      `UPDATE users SET deleted_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId],
    );
    sendSuccess(res, { deleted: true });
  }),
);

// ─── POST /api/admin/users/bulk ──────────────────────────────────────────────
router.post(
  '/users/bulk',
  checkPermission('admin', 'create'),
  asyncHandler(async (req, res) => {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { users } = req.body as { users: Array<{ full_name: string; email?: string; role: string; national_id?: string }> };
    if (!Array.isArray(users) || users.length === 0) {
      sendError(res, 'users array is required', 400);
      return;
    }
    const created: any[] = [];
    for (const u of users) {
      const { rows } = await pool.query<UserRow & { id: string }>(
        `INSERT INTO users (tenant_id, full_name, email, role, national_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING user_id as id, full_name, email, role, is_active`,
        [tenantId, u.full_name, u.email || null, u.role, u.national_id || null],
      );
      created.push(rows[0]);
    }
    sendSuccess(res, { created: created.length, users: created }, undefined, 201);
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
    const { role } = req.params;
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
    const { role } = req.params;
    const permissions = req.body as Record<string, Record<string, boolean>>;
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
    const { role } = req.params;
    const actorId = (req as any).userId;
    const before = await getRolePermissions(tenantId, role);
    const result = await resetRolePermissions(tenantId, role, { actorId });
    sendSuccess(res, result);
  }),
);

export default router;
