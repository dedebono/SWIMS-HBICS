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

// ─── USER DIRECTORY MANAGEMENT ───────────────────────────────────────────────

const userSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['STUDENT', 'TEACHER', 'COUNSELOR', 'SCHOOL_HEAD', 'SCHOOL_NURSE', 'BOARD_MEMBER', 'CASE_REVIEWER', 'HOMEROOM_TEACHER', 'IT_ADMIN', 'SUBSTITUTE_TEACHER']),
  national_id: z.string().optional(),
});

const bulkUserSchema = z.object({
  users: z.array(userSchema).min(1).max(1000)
});

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    if (req.userRole !== 'IT_ADMIN') {
      res.status(403).json({ success: false, error: { message: "Only IT_ADMIN can view users" }});
      return;
    }
    const result = await adminUsersService.getAllUsers(req.tenantId);
    sendSuccess(res, result);
  })
);

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    if (req.userRole !== 'IT_ADMIN') {
      res.status(403).json({ success: false, error: { message: "Only IT_ADMIN can add users" }});
      return;
    }
    const body = userSchema.parse(req.body);
    const result = await adminUsersService.createUser(req.tenantId, body);
    sendCreated(res, result);
  })
);

router.post(
  '/users/bulk',
  asyncHandler(async (req, res) => {
    if (req.userRole !== 'IT_ADMIN') {
      res.status(403).json({ success: false, error: { message: "Only IT_ADMIN can bulk add users" }});
      return;
    }
    const body = bulkUserSchema.parse(req.body);
    const result = await adminUsersService.createUsersBulk(req.tenantId, body.users);
    sendCreated(res, result);
  })
);

export default router;
