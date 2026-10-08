import { pool } from '../db/pool.js';
import { PERMISSIONS } from '@swims/shared';
import { auditLog } from '../utils/audit-log.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** role → resource → action → allowed */
export type PermissionMatrix = Record<string, Record<string, Record<string, boolean>>>;

/** resource → action → allowed (single role slice) */
export type RolePermissionSlice = Record<string, Record<string, boolean>>;

/** Request body shape for PUT /role-permissions/:role */
export type RolePermissionInput = Record<string, Record<string, boolean>>;

// ─── Defaults ──────────────────────────────────────────────────────────────────
// The static PERMISSIONS matrix in @swims/shared is the single source of truth
// for default values. We additionally grant the `admin: manage` action (used by
// checkPermission('admin', 'manage')) to IT_ADMIN by default.

const DEFAULT_MANAGE_ROLES: Record<string, boolean> = {
  IT_ADMIN: true,
};

interface PermissionRow {
  role: string;
  resource: string;
  action: string;
  allowed: boolean;
}

/** Build the default seed rows for a tenant from the static PERMISSIONS matrix. */
function buildDefaultRows(tenantId: string): PermissionRow[] {
  const rows: PermissionRow[] = [];

  for (const [role, resources] of Object.entries(PERMISSIONS)) {
    for (const [resource, flags] of Object.entries(resources as Record<string, Record<string, boolean>>)) {
      for (const [action, allowed] of Object.entries(flags)) {
        rows.push({ role, resource, action, allowed: Boolean(allowed) });
      }
    }
  }

  // admin 'manage' defaults (not part of the static CRUD matrix)
  for (const [role, allowed] of Object.entries(DEFAULT_MANAGE_ROLES)) {
    rows.push({ role, resource: 'admin', action: 'manage', allowed });
  }

  // Attach tenant_id for bulk insert
  return rows.map((r) => ({ ...r, tenant_id: tenantId }) as PermissionRow & { tenant_id: string });
}

// ─── Cache (TTL 60s) ───────────────────────────────────────────────────────────
// Avoids a DB round-trip on every permission check. Short TTL is fine because
// permission changes are rare and eventual consistency of ~1 min is acceptable.

interface CacheEntry {
  value: PermissionMatrix;
  expiresAt: number;
}
const matrixCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function getCached(tenantId: string): PermissionMatrix | undefined {
  const entry = matrixCache.get(tenantId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    matrixCache.delete(tenantId);
    return undefined;
  }
  return entry.value;
}

function setCached(tenantId: string, value: PermissionMatrix): void {
  if (matrixCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of matrixCache) {
      if (now > v.expiresAt) matrixCache.delete(k);
    }
  }
  matrixCache.set(tenantId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateTenantCache(tenantId: string): void {
  matrixCache.delete(tenantId);
}

// ─── Read ──────────────────────────────────────────────────────────────────────

/** Ensure the tenant has seeded defaults (idempotent). */
async function ensureSeeded(tenantId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

    // Find which roles from the static matrix are missing in this tenant.
    // We seed ONLY the missing ones. This avoids the migration-026 race
    // where PERSONAL rows can be backfilled before the tenant is fully
    // seeded — in that scenario the old "COUNT(*) > 0" shortcut would
    // silently skip seeding all other roles.
    const { rows: existingRoles } = await client.query<{ role: string }>(
      `SELECT DISTINCT role FROM role_permissions WHERE tenant_id = $1`,
      [tenantId],
    );
    const present = new Set(existingRoles.map(r => r.role));
    const allRoles = Object.keys(PERMISSIONS).sort();
    const missing = allRoles.filter(r => !present.has(r));

    if (missing.length === 0) {
      // Also make sure the admin 'manage' defaults exist for the tenant
      const { rows: manageRows } = await client.query<{ role: string }>(
        `SELECT DISTINCT role FROM role_permissions WHERE tenant_id = $1 AND resource = 'admin' AND action = 'manage'`,
        [tenantId],
      );
      const hasManage = new Set(manageRows.map(r => r.role));
      const missingManage = Object.entries(DEFAULT_MANAGE_ROLES)
        .filter(([role, allowed]) => allowed && !hasManage.has(role))
        .map(([role]) => role);

      if (missingManage.length === 0) return;

      // Seed admin 'manage' defaults
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      for (const role of missingManage) {
        placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        values.push(tenantId, role, 'admin', 'manage', true);
      }
      await client.query(
        `INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (tenant_id, role, resource, action) DO NOTHING`,
        values,
      );
      return;
    }

    const seed = (buildDefaultRows(tenantId) as (PermissionRow & { tenant_id: string })[]).filter((r) => missing.includes(r.role));
    if (seed.length === 0) return;

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const r of seed) {
      placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
      values.push(r.tenant_id, r.role, r.resource, r.action, r.allowed);
    }
    await client.query(
      `INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (tenant_id, role, resource, action) DO NOTHING`,
      values,
    );
  } finally {
    client.release();
  }
}

/** Returns the full permission matrix for a tenant (role → resource → action → bool). */
export async function getTenantPermissionMatrix(tenantId: string): Promise<PermissionMatrix> {
  const cached = getCached(tenantId);
  if (cached) return cached;

  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

    const { rows } = await client.query<{ role: string; resource: string; action: string; allowed: boolean }>(
      `SELECT role, resource, action, allowed
       FROM role_permissions
       WHERE tenant_id = $1`,
      [tenantId],
    );

    if (rows.length === 0) {
      await ensureSeeded(tenantId);
      const { rows: seeded } = await client.query<{ role: string; resource: string; action: string; allowed: boolean }>(
        `SELECT role, resource, action, allowed
         FROM role_permissions
         WHERE tenant_id = $1`,
        [tenantId],
      );
      const matrix = rowsToMatrix(seeded);
      setCached(tenantId, matrix);
      return matrix;
    }

    const matrix = rowsToMatrix(rows);
    setCached(tenantId, matrix);
    return matrix;
  } finally {
    client.release();
  }
}

/** Returns the permission slice for a single role, or null if the role has no rows. */
export async function getRolePermissions(tenantId: string, role: string): Promise<RolePermissionSlice | null> {
  const matrix = await getTenantPermissionMatrix(tenantId);
  return matrix[role] ?? null;
}

function rowsToMatrix(
  rows: Array<{ role: string; resource: string; action: string; allowed: boolean }>,
): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const row of rows) {
    matrix[row.role] ??= {};
    matrix[row.role][row.resource] ??= {};
    matrix[row.role][row.resource][row.action] = row.allowed;
  }
  return matrix;
}

// ─── Write ─────────────────────────────────────────────────────────────────────

/**
 * Upsert the permission matrix for a single role.
 * `permissions` is resource → action → bool. Unknown resources/actions are ignored
 * only if absent; everything provided is stored.
 */
export async function setRolePermissions(
  tenantId: string,
  role: string,
  permissions: RolePermissionInput,
  actor?: { actorId?: string; before?: RolePermissionSlice | null },
): Promise<RolePermissionSlice> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [resource, actions] of Object.entries(permissions)) {
      for (const [action, allowed] of Object.entries(actions)) {
        placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        values.push(tenantId, role, resource, action, Boolean(allowed));
      }
    }

    if (placeholders.length === 0) {
      throw new Error('No permission rows provided');
    }

    await client.query(
      `INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (tenant_id, role, resource, action)
       DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()`,
      values,
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  invalidateTenantCache(tenantId);

  const after = await getRolePermissions(tenantId, role);

  await auditLog({
    action: 'UPDATE_ROLE_PERMISSIONS',
    entityType: 'role_permissions',
    // audit_logs.entity_id is a uuid column — a role name is not a uuid, so the
    // role goes into the state payload instead. Passing `${tenantId}:${role}`
    // here made every INSERT fail and the audit trail was silently lost.
    entityId: undefined,
    before: actor?.before ? { role, permissions: actor.before } : null,
    after: after ? { role, permissions: after } : null,
    tenantId,
    actorId: actor?.actorId,
  }).catch(() => undefined);

  return after ?? {};
}

/** Reset a single role's permissions back to the static defaults. */
export async function resetRolePermissions(
  tenantId: string,
  role: string,
  actor?: { actorId?: string; before?: RolePermissionSlice | null },
): Promise<RolePermissionSlice> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

    // Delete existing rows for this role
    await client.query(
      `DELETE FROM role_permissions WHERE tenant_id = $1 AND role = $2`,
      [tenantId, role],
    );

    // Re-insert only this role's defaults
    const seed = buildDefaultRows(tenantId).filter((r) => r.role === role);
    if (seed.length > 0) {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      for (const r of seed) {
        placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        values.push(r.tenant_id, r.role, r.resource, r.action, r.allowed);
      }
      await client.query(
        `INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (tenant_id, role, resource, action) DO NOTHING`,
        values,
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  invalidateTenantCache(tenantId);

  const after = await getRolePermissions(tenantId, role);

  await auditLog({
    action: 'RESET_ROLE_PERMISSIONS',
    entityType: 'role_permissions',
    entityId: undefined,
    before: actor?.before ? { role, permissions: actor.before } : null,
    after: after ? { role, permissions: after } : null,
    tenantId,
    actorId: actor?.actorId,
  }).catch(() => undefined);

  return after ?? {};
}
