import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { queryWithTenant } from '../db/pool.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

// ─── GET /api/analytics/summary ──────────────────────────────────────────────
// Phase 3 CTE-based advanced analytics aggregation example

router.get(
  '/summary',
  checkPermission('cases', 'read'), 
  asyncHandler(async (req, res) => {
    // Advanced CTE Analytics extracting incident frequencies grouped by severity and month
    const { rows } = await queryWithTenant(
      req.tenantId,
      `WITH monthly_incidents AS (
         SELECT 
           date_trunc('month', incident_at) AS month,
           severity,
           COUNT(*) as count
         FROM incidents
         WHERE tenant_id = $1 AND deleted_at IS NULL
         GROUP BY month, severity
       )
       SELECT month, severity, count 
       FROM monthly_incidents
       ORDER BY month DESC, severity ASC`,
      [req.tenantId]
    );

    sendSuccess(res, rows);
  }),
);

export default router;
