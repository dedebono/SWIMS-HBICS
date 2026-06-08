import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as caseSharesService from '../services/case-shares.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

// Case shares router — mounted at /api/cases
const router = Router();

// Teachers listing router — mounted at /api
const teacherRouter = Router();

router.use(authenticate, setTenantContext);
teacherRouter.use(authenticate, setTenantContext);

const shareCaseSchema = z.object({
  shared_with: z.array(z.string().uuid()).min(1).max(20),
  permission: z.enum(['VIEW', 'CONTRIBUTE']).optional(),
});

// ─── POST /api/cases/:caseId/share ─────────────────────────────────────────

router.post(
  '/:caseId/share',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const body = shareCaseSchema.parse(req.body);
    const result = await caseSharesService.shareCase(
      req.tenantId,
      String(req.params['caseId']),
      body,
      req.userId,
      req,
    );
    sendCreated(res, result);
  }),
);

// ─── GET /api/cases/:caseId/shares ─────────────────────────────────────────

router.get(
  '/:caseId/shares',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const result = await caseSharesService.listCaseShares(
      req.tenantId,
      String(req.params['caseId']),
    );
    sendSuccess(res, result);
  }),
);

// ─── DELETE /api/cases/:caseId/share/:userId ───────────────────────────────

router.delete(
  '/:caseId/share/:userId',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    await caseSharesService.removeShare(
      req.tenantId,
      String(req.params['caseId']),
      String(req.params['userId']),
      req.userId,
      req,
    );
    sendSuccess(res, { message: 'Share removed successfully' });
  }),
);

// ─── GET /api/users/teachers (on teacherRouter, mounted at /api) ────────────

teacherRouter.get(
  '/users/teachers',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const page = req.query['page'] ? Number(req.query['page']) : undefined;
    const result = await caseSharesService.listAvailableTeachers(
      req.tenantId,
      page,
    );
    sendSuccess(res, result);
  }),
);

export { teacherRouter };
export default router;
