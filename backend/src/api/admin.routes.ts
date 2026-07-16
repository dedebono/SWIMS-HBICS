import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { queryWithTenant } from '../db/pool.js';
import { executeRightToBeForgotten } from '../services/rtbf.service.js';
import * as adminUsersService from '../services/admin-users.service.js';
import * as rolePermissionsService from '../services/role-permissions.service.js';
import * as dataMigrationService from '../services/data-migration.service.js';
import { NotFoundError } from '../utils/errors.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const rtbfSchema = z.object({
  student_id: z.string().uuid()
});

// ─── POST /api/admin/rtbf-request ──────────────────────────────────────────

router.post(
  '/rtbf-request',
  checkPermission('admin', 'manage'),
  asyncHandler(async (req, res) => {
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

// ─── USER DIRECTORY MANAGEMENT ───────────────────────────────────────────────

const userSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['STUDENT', 'TEACHER', 'COUNSELOR', 'SCHOOL_HEAD', 'SCHOOL_NURSE', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN', 'SUBSTITUTE_TEACHER']),
  national_id: z.string().optional(),
  password: z.string().min(8).optional(),
});

const bulkUserSchema = z.object({
  users: z.array(userSchema).min(1).max(1000)
});

router.get(
  '/users',
  checkPermission('admin', 'read'),
  asyncHandler(async (req, res) => {
    console.log(`[Admin Users] GET /users — tenantId: ${req.tenantId}, role: ${req.userRole}`);
    const result = await adminUsersService.getAllUsers(req.tenantId);
    sendSuccess(res, result);
  }),
);

router.post(
  '/users',
  checkPermission('admin', 'create'),
  asyncHandler(async (req, res) => {
    const body = userSchema.parse(req.body);
    const result = await adminUsersService.createUser(req.tenantId, body);
    sendCreated(res, result);
  }),
);

router.post(
  '/users/bulk',
  checkPermission('admin', 'create'),
  asyncHandler(async (req, res) => {
    const body = bulkUserSchema.parse(req.body);
    const result = await adminUsersService.createUsersBulk(req.tenantId, body.users);
    sendCreated(res, result);
  }),
);

const updateUserSchema = z.object({
  full_name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['STUDENT', 'TEACHER', 'COUNSELOR', 'SCHOOL_HEAD', 'SCHOOL_NURSE', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN', 'SUBSTITUTE_TEACHER']).optional(),
  national_id: z.string().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

router.put(
  '/users/:userId',
  checkPermission('admin', 'update'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params as { userId: string };
    const body = updateUserSchema.parse(req.body);
    const result = await adminUsersService.updateUser(req.tenantId, userId, body);
    sendSuccess(res, result);
  }),
);

// ─── DYNAMIC ROLE PERMISSIONS (User Management) ───────────────────────────────
// Lets admins configure, per role, which actions (create/read/update/delete and
// admin:manage) are allowed on each resource. Stored per-tenant in role_permissions.

const roleParam = z.string().min(1).max(50);
const rolePermissionBody = z.record(z.string(), z.record(z.string(), z.boolean()));

// Full matrix for the tenant
router.get(
  '/role-permissions',
  checkPermission('admin', 'read'),
  asyncHandler(async (req, res) => {
    const matrix = await rolePermissionsService.getTenantPermissionMatrix(req.tenantId);
    sendSuccess(res, matrix);
  }),
);

// Single role slice
router.get(
  '/role-permissions/:role',
  checkPermission('admin', 'read'),
  asyncHandler(async (req, res) => {
    const { role } = req.params as { role: string };
    roleParam.parse(role);
    const slice = await rolePermissionsService.getRolePermissions(req.tenantId, role);
    if (!slice) {
      throw new NotFoundError(`No permissions configured for role: ${role}`);
    }
    sendSuccess(res, slice);
  }),
);

// Update a single role's permissions
router.put(
  '/role-permissions/:role',
  checkPermission('admin', 'update'),
  asyncHandler(async (req, res) => {
    const { role } = req.params as { role: string };
    roleParam.parse(role);
    const body = rolePermissionBody.parse(req.body);
    const before = await rolePermissionsService.getRolePermissions(req.tenantId, role);
    const after = await rolePermissionsService.setRolePermissions(
      req.tenantId,
      role,
      body,
      { actorId: req.userId, before },
    );
    sendSuccess(res, after);
  }),
);

// Reset a single role's permissions back to defaults
router.post(
  '/role-permissions/:role/reset',
  checkPermission('admin', 'update'),
  asyncHandler(async (req, res) => {
    const { role } = req.params as { role: string };
    roleParam.parse(role);
    const before = await rolePermissionsService.getRolePermissions(req.tenantId, role);
    const after = await rolePermissionsService.resetRolePermissions(
      req.tenantId,
      role,
      { actorId: req.userId, before },
    );
    sendSuccess(res, after);
  }),
);

// ─── SYSTEM SUMMARY (Admin IT overview) ───────────────────────────────
// System/account aggregates only — no case, incident, intervention or
// observation data is ever exposed to the IT admin.
router.get(
  '/system-summary',
  checkPermission('admin', 'read'),
  asyncHandler(async (req, res) => {
    const tid = req.tenantId;

    const [usersByRole, activeUsers, students] = await Promise.all([
      queryWithTenant<{ role: string; count: number }>(
        tid,
        `SELECT role, COUNT(*)::int AS count
         FROM users WHERE tenant_id = $1 AND deleted_at IS NULL
         GROUP BY role ORDER BY count DESC`,
        [tid],
      ),
      queryWithTenant<{ count: number }>(
        tid,
        `SELECT COUNT(*)::int AS count FROM users
         WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true`,
        [tid],
      ),
      queryWithTenant<{ count: number }>(
        tid,
        `SELECT COUNT(*)::int AS count FROM students
         WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tid],
      ),
    ]);

    const roleDistribution: Record<string, number> = {};
    for (const r of usersByRole.rows) roleDistribution[r.role] = Number(r.count);

    const totalUsers = Object.values(roleDistribution).reduce((a, b) => a + b, 0);
    const active = Number(activeUsers.rows[0]?.count ?? 0);
    const inactive = Math.max(0, totalUsers - active);

    sendSuccess(res, {
      totalUsers,
      activeUsers: active,
      inactiveUsers: inactive,
      students: Number(students.rows[0]?.count ?? 0),
      roleDistribution,
    });
  }),
);

// ─── DATA MIGRATION (Export / Import) ─────────────────────────────────
// Lets the IT admin export all users, students and active cases (with their
// related records, excluding media) for migration to a new production server,
// and import such an export back in.

router.get(
  '/export',
  checkPermission('admin', 'read'),
  asyncHandler(async (req, res) => {
    const payload = await dataMigrationService.exportData(req.tenantId);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="swims-export-${stamp}.json"`,
    );
    res.json(payload);
  }),
);

router.post(
  '/import',
  checkPermission('admin', 'manage'),
  asyncHandler(async (req, res) => {
    const result = await dataMigrationService.importData(req.tenantId, req.body);
    sendSuccess(res, result);
  }),
);

export default router;
