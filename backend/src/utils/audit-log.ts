import { auditPool } from '../db/pool.js';
import type { Request } from 'express';

export interface AuditLogParams {
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  req?: Request;
  tenantId?: string;
  actorId?: string;
}

/**
 * Write an entry to the append-only audit_logs table.
 * Uses the dedicated swims_audit DB role (INSERT-only privileges).
 * This is the ONLY code path allowed to write to audit_logs.
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  const {
    action,
    entityType,
    entityId,
    before = null,
    after = null,
    req,
    tenantId,
    actorId,
  } = params;

  const resolvedTenantId = tenantId ?? (req as Record<string, unknown> | undefined)?.['tenantId'] as string | undefined ?? null;
  const resolvedActorId = actorId ?? (req as Record<string, unknown> | undefined)?.['userId'] as string | undefined ?? null;
  const ipAddress = req?.ip ?? req?.socket?.remoteAddress ?? null;
  const userAgent = req?.get('user-agent') ?? null;

  try {
    await auditPool.query(
      `INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::INET, $9)`,
      [
        resolvedTenantId,
        resolvedActorId,
        action,
        entityType,
        entityId ?? null,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        ipAddress,
        userAgent,
      ],
    );
  } catch (err) {
    // Audit logging failures should not crash the application,
    // but must be logged for investigation
    console.error('[AUDIT_LOG_ERROR] Failed to write audit log:', {
      action,
      entityType,
      entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
