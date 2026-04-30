import pg from 'pg';
import { env } from '../config/env.js';

// ─── Main application pool ──────────────────────────────────────────────────
// Used for all queries. RLS is enforced via SET LOCAL app.tenant_id per request.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ─── Audit pool (INSERT-only role) ──────────────────────────────────────────
// Uses the swims_audit role which only has INSERT permission on audit_logs.
export const auditPool = new pg.Pool({
  connectionString: env.DATABASE_AUDIT_URL ?? env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ─── Helper: get a client with tenant context set ───────────────────────────
export async function getClientWithTenant(tenantId: string): Promise<pg.PoolClient> {
  const client = await pool.connect();
  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  return client;
}

// ─── Helper: execute query with automatic tenant context ────────────────────
export async function queryWithTenant<T extends pg.QueryResultRow>(
  tenantId: string,
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────
export async function closePool(): Promise<void> {
  await pool.end();
  await auditPool.end();
}
