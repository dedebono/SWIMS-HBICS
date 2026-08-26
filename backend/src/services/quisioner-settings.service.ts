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

export async function getSettings(tenantId: string): Promise<{ threshold: number; target: 'student' | 'staff' }> {
  const { rows } = await queryWithTenant<{ threshold: string; target: string }>(
    tenantId,
    `SELECT threshold, target FROM quisioner_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  if (rows[0]) {
    return { threshold: Number(rows[0].threshold), target: rows[0].target as 'student' | 'staff' };
  }
  const { rows: ins } = await queryWithTenant<{ threshold: string; target: string }>(
    tenantId,
    `INSERT INTO quisioner_settings (tenant_id, threshold, target)
     VALUES ($1, 7, 'student')
     ON CONFLICT (tenant_id) DO UPDATE SET threshold = EXCLUDED.threshold
     RETURNING threshold, target`,
    [tenantId],
  );
  return { threshold: Number(ins[0]!.threshold), target: ins[0]!.target as 'student' | 'staff' };
}

export async function setSettings(
  tenantId: string,
  data: { threshold?: number; target?: 'student' | 'staff' },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [tenantId];
  let i = 2;
  if (data.threshold !== undefined) { sets.push(`threshold = $${i++}`); vals.push(data.threshold); }
  if (data.target !== undefined) { sets.push(`target = $${i++}`); vals.push(data.target); }
  if (sets.length > 0) {
    await queryWithTenant(
      tenantId,
      `UPDATE quisioner_settings SET ${sets.join(', ')} WHERE tenant_id = $1`,
      vals,
    );
  }
}
