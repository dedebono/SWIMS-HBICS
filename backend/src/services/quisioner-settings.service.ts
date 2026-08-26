import { queryWithTenant } from '../db/pool.js';

export async function getThreshold(tenantId: string): Promise<number> {
  const { rows } = await queryWithTenant<{ threshold: string }>(
    tenantId,
    `SELECT threshold FROM quisioner_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  const row = rows[0];
  return row ? Number(row.threshold) : 7;
}

export async function setThreshold(tenantId: string, threshold: number): Promise<void> {
  await queryWithTenant(
    tenantId,
    `INSERT INTO quisioner_settings (tenant_id, threshold, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (tenant_id) DO UPDATE SET threshold = $2, updated_at = now()`,
    [tenantId, threshold],
  );
}
