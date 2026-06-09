import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { executeRightToBeForgotten } from '../services/rtbf.service.js';
import * as adminUsersService from '../services/admin-users.service.js';
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
  role: z.enum(['STUDENT', 'TEACHER', 'COUNSELOR', 'SCHOOL_HEAD', 'SCHOOL_NURSE', 'BOARD_MEMBER', 'CASE_REVIEWER', 'HOMEROOM_TEACHER', 'IT_ADMIN', 'SUBSTITUTE_TEACHER']),
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
  role: z.enum(['STUDENT', 'TEACHER', 'COUNSELOR', 'SCHOOL_HEAD', 'SCHOOL_NURSE', 'BOARD_MEMBER', 'CASE_REVIEWER', 'HOMEROOM_TEACHER', 'IT_ADMIN', 'SUBSTITUTE_TEACHER']).optional(),
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

export default router;
