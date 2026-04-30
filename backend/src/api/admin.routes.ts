import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { executeRightToBeForgotten } from '../services/rtbf.service.js';
import { sendSuccess } from '../utils/response.js';

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

export default router;
