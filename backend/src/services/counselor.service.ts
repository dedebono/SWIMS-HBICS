import { queryWithTenant } from '../db/pool.js';
import type { CaseRow } from '@swims/shared';

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getCounselorDashboardStats(
  tenantId: string,
  counselorId: string,
): Promise<{
  activeCases: number;
  criticalCases: number;
  overdueInterventions: number;
  unreviewedAlerts: number;
}> {
  // Count active cases assigned or visible to counselor
  const { rows: casesRows } = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) as count FROM cases 
     WHERE tenant_id = $1 AND status != 'CLOSED' AND deleted_at IS NULL`,
    [tenantId]
  );

  // Count critical risk cases
  const { rows: criticalRows } = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) as count FROM cases 
     WHERE tenant_id = $1 AND risk_level = 'CRITICAL' AND status != 'CLOSED' AND deleted_at IS NULL`,
    [tenantId]
  );

  // Count unreviewed Alerts
  const { rows: alertsRows } = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) as count FROM alerts 
     WHERE tenant_id = $1 AND status = 'PENDING' AND expires_at > now()`,
    [tenantId]
  );

  // Count Overdue interventions (scheduled_at in past, completed_at is null)
  const { rows: overdueRows } = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) as count FROM interventions 
     WHERE tenant_id = $1 AND completed_at IS NULL AND scheduled_at < now() AND deleted_at IS NULL`,
    [tenantId]
  );

  return {
    activeCases: parseInt(casesRows[0]?.count ?? '0', 10),
    criticalCases: parseInt(criticalRows[0]?.count ?? '0', 10),
    unreviewedAlerts: parseInt(alertsRows[0]?.count ?? '0', 10),
    overdueInterventions: parseInt(overdueRows[0]?.count ?? '0', 10),
  };
}

// ─── List Dormant Cases ────────────────────────────────────────────────────

export async function getDormantCases(
  tenantId: string,
): Promise<CaseRow[]> {
  // Fetch cases where no action has been taken in 5+ days (updated_at)
  const { rows } = await queryWithTenant<CaseRow>(
    tenantId,
    `SELECT * FROM cases 
     WHERE tenant_id = $1 
       AND status != 'CLOSED' 
       AND deleted_at IS NULL 
       AND updated_at < now() - INTERVAL '5 days'
     ORDER BY updated_at ASC
     LIMIT 5`,
    [tenantId]
  );

  return rows;
}
