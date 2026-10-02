import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';

/**
 * Middleware: Set PostgreSQL session variable for RLS tenant isolation.
 * Must run AFTER authenticate middleware (needs req.tenantId from JWT).
 *
 * NOTE: This sets the tenant_id on the connection from the pool,
 * but since pool connections are shared, the actual SET LOCAL must happen
 * per-query/per-transaction. This middleware stores the tenantId so
 * service-layer functions can use queryWithTenant() or getClientWithTenant().
 *
 * For defense-in-depth, we also verify the tenant exists and is not deleted.
 */
export async function setTenantContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) {
      return next(new Error('tenantId not set — authenticate middleware must run first'));
    }

    // Verify tenant is active (no RLS on tenants table, so direct query is fine)
    const { rows } = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM tenants WHERE tenant_id = $1 AND deleted_at IS NULL',
      [req.tenantId],
    );

    if (rows.length === 0) {
      return next(new Error('Tenant not found or has been deleted'));
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware for anonymous (no-login) public pages.
 * Resolves the tenant from a `?t=<slug>` query param (the QR link encodes it),
 * so the backend can scope queries via RLS without a JWT.
 */
export async function setTenantFromSlug(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = req.query.t || (req.body && (req.body as Record<string, unknown>)['tenant']);
    if (!slug || typeof slug !== 'string') {
      return next(new Error('tenant slug required'));
    }

    const { rows } = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM tenants WHERE slug = $1 AND deleted_at IS NULL',
      [slug],
    );

    if (rows.length === 0) {
      return next(new Error('tenant not found'));
    }

    (req as unknown as Record<string, unknown>)['tenantId'] = rows[0]!.tenant_id;
    next();
  } catch (err) {
    next(err);
  }
}
