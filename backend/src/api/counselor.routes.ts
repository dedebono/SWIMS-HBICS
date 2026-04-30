import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as counselorService from '../services/counselor.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

// ─── GET /api/counselor/dashboard ───────────────────────────────────────────

router.get(
  '/dashboard',
  // Normally only COUNSELOR role or SCHOOL_HEAD should access the raw aggregated view
  checkPermission('cases', 'read'), 
  asyncHandler(async (req, res) => {
    const stats = await counselorService.getCounselorDashboardStats(
      req.tenantId,
      req.userId,
    );
    
    const dormantCases = await counselorService.getDormantCases(req.tenantId);

    sendSuccess(res, {
      stats,
      dormantCases,
    });
  }),
);

export default router;
