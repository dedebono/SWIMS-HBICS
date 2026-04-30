import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { queryWithTenant } from '../db/pool.js';
import { sendSuccess } from '../utils/response.js';
import type { AuditLogRow } from '@swims/shared';

const router = Router();

router.use(authenticate, setTenantContext);

const listAuditLogsSchema = z.object({
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

// ─── GET /api/audit-logs ─────────────────────────────────────────────────────

router.get(
  '/',
  checkPermission('audit_logs', 'read'),
  asyncHandler(async (req, res) => {
    const query = listAuditLogsSchema.parse(req.query);
    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [req.tenantId];
    let paramIdx = 2;

    if (query.entity_type) {
      conditions.push(`entity_type = $${paramIdx++}`);
      values.push(query.entity_type);
    }
    if (query.entity_id) {
      conditions.push(`entity_id = $${paramIdx++}`);
      values.push(query.entity_id);
    }
    if (query.action) {
      conditions.push(`action = $${paramIdx++}`);
      values.push(query.action);
    }
    if (query.from) {
      conditions.push(`created_at >= $${paramIdx++}::TIMESTAMPTZ`);
      values.push(query.from);
    }
    if (query.to) {
      conditions.push(`created_at <= $${paramIdx++}::TIMESTAMPTZ`);
      values.push(query.to);
    }

    const whereClause = conditions.join(' AND ');
    const offset = (query.page - 1) * query.limit;

    // audit_logs has no RLS, so we query directly (filtered by tenant_id)
    const countResult = await queryWithTenant<{ count: string }>(
      req.tenantId,
      `SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}`,
      values,
    );

    const dataResult = await queryWithTenant<AuditLogRow>(
      req.tenantId,
      `SELECT * FROM audit_logs
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, query.limit, offset],
    );

    const total = Number(countResult.rows[0]?.count ?? 0);

    sendSuccess(res, dataResult.rows, {
      page: query.page,
      limit: query.limit,
      total,
      hasMore: query.page * query.limit < total,
    });
  }),
);

export default router;
