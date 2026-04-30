import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

// ─── GET /api/alerts ─────────────────────────────────────────────────────────

router.get(
  '/',
  checkPermission('alerts', 'read'),
  asyncHandler(async (_req, res) => {
    // Stubbed for Phase 1 — Pattern detection engine is Phase 3
    sendSuccess(res, [], { total: 0, hasMore: false });
  }),
);

// ─── PATCH /api/alerts/:alertId ──────────────────────────────────────────────

router.patch(
  '/:alertId',
  checkPermission('alerts', 'update'),
  asyncHandler(async (_req, res) => {
    sendError(res, 'Alert management not yet implemented (Phase 3)', 501);
  }),
);

// ─── POST /api/alerts/run-detection ──────────────────────────────────────────

router.post(
  '/run-detection',
  checkPermission('alerts', 'update'),
  asyncHandler(async (_req, res) => {
    sendError(res, 'Pattern detection not yet implemented (Phase 3)', 501);
  }),
);

export default router;
