import { getClientWithTenant, queryWithTenant } from '../db/pool.js';

export interface SwimsExport {
  version: number;
  exportedAt: string;
  sourceTenantId: string;
  // Tables exported. Media is intentionally excluded.
  data: Record<string, Record<string, unknown>[]>;
}

const EXPORT_VERSION = 1;

// Whitelisted columns per table. Importing only these columns (taken from a
// trusted constant, never from the file) prevents SQL injection from an
// untrusted export file and keeps imports aligned with the current schema.
const TABLE_COLUMNS: Record<string, string[]> = {
  students: [
    'student_id', 'tenant_id', 'full_name', 'date_of_birth', 'gender',
    'national_id', 'qr_code', 'metadata', 'created_at', 'deleted_at',
  ],
  users: [
    'user_id', 'tenant_id', 'full_name', 'email', 'password_hash', 'role',
    'is_active', 'created_at', 'deleted_at',
  ],
  cases: [
    'case_id', 'tenant_id', 'student_id', 'case_type', 'status', 'risk_level',
    'risk_level_source', 'assigned_counselor', 'school_phase_ref', 'opened_date',
    'closed_date', 'summary', 'metadata', 'created_by', 'created_at',
    'updated_at', 'deleted_at',
  ],
  incidents: [
    'incident_id', 'tenant_id', 'case_id', 'student_id', 'category',
    'sub_category', 'severity', 'description', 'location', 'incident_at',
    'reported_by', 'witnesses', 'immediate_actions', 'language_flag',
    'created_at', 'updated_at', 'deleted_at',
  ],
  interventions: [
    'intervention_id', 'tenant_id', 'case_id', 'incident_id', 'assigned_staff',
    'type', 'description', 'scheduled_at', 'completed_at', 'outcome',
    'effectiveness', 'created_by', 'created_at', 'updated_at', 'deleted_at',
  ],
  positive_observations: [
    'observation_id', 'tenant_id', 'student_id', 'case_id', 'recorded_by',
    'category', 'description', 'observed_at', 'created_at', 'deleted_at',
  ],
  case_shares: [
    'share_id', 'tenant_id', 'case_id', 'shared_with', 'shared_by',
    'permission', 'created_at',
  ],
};

// Insertion order honours foreign-key dependencies:
// students/users -> cases -> children of cases.
const TABLE_ORDER = [
  'students',
  'users',
  'cases',
  'incidents',
  'interventions',
  'positive_observations',
  'case_shares',
] as const;

/**
 * Export all users, all students, and every ACTIVE case (status != 'CLOSED')
 * together with its incidents, interventions, positive observations and shares.
 * Media assets are excluded by design.
 */
export async function exportData(tenantId: string): Promise<SwimsExport> {
  const activeCasesRes = await queryWithTenant(
    tenantId,
    `SELECT * FROM cases
     WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'CLOSED'`,
    [tenantId],
  );
  const activeCases = activeCasesRes.rows;
  const activeCaseIds = activeCases.map((c: any) => c.case_id);

  const students = (
    await queryWithTenant(
      tenantId,
      `SELECT * FROM students WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    )
  ).rows;

  const users = (
    await queryWithTenant(
      tenantId,
      `SELECT * FROM users WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    )
  ).rows;

  const incidents = (
    await queryWithTenant(
      tenantId,
      `SELECT * FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL AND case_id = ANY($2)`,
      [tenantId, activeCaseIds],
    )
  ).rows;

  const interventions = (
    await queryWithTenant(
      tenantId,
      `SELECT * FROM interventions
       WHERE tenant_id = $1 AND deleted_at IS NULL AND case_id = ANY($2)`,
      [tenantId, activeCaseIds],
    )
  ).rows;

  const positiveObservations = (
    await queryWithTenant(
      tenantId,
      `SELECT * FROM positive_observations
       WHERE tenant_id = $1 AND deleted_at IS NULL AND case_id = ANY($2)`,
      [tenantId, activeCaseIds],
    )
  ).rows;

  const caseShares = (
    await queryWithTenant(
      tenantId,
      `SELECT * FROM case_shares WHERE tenant_id = $1 AND case_id = ANY($2)`,
      [tenantId, activeCaseIds],
    )
  ).rows;

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceTenantId: tenantId,
    data: {
      students,
      users,
      cases: activeCases,
      incidents,
      interventions,
      positive_observations: positiveObservations,
      case_shares: caseShares,
    },
  };
}

export interface ImportResult {
  imported: Record<string, number>;
  version: number;
}

/**
 * Import a previously exported dataset into the current tenant. All rows keep
 * their original UUIDs (so internal relationships survive) but are re-owned by
 * the current tenant. Existing rows (by primary key) are skipped — making
 * import idempotent and safe for a fresh / new production database.
 */
export async function importData(
  tenantId: string,
  payload: unknown,
): Promise<ImportResult> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Format file ekspor tidak valid.');
  }
  const data = (payload as any).data;
  if (!data || typeof data !== 'object') {
    throw new Error('Struktur ekspor tidak dikenali (butuh properti "data").');
  }

  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');
    // Re-assert tenant context inside the transaction for safety.
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

    const imported: Record<string, number> = {};

    for (const table of TABLE_ORDER) {
      const rows: Record<string, unknown>[] = Array.isArray(data[table])
        ? data[table]
        : [];
      if (rows.length === 0) {
        imported[table] = 0;
        continue;
      }

      const cols = TABLE_COLUMNS[table];
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const row of rows) {
        const rowVals: unknown[] = [];
        for (const col of cols) {
          if (col === 'tenant_id') {
            rowVals.push(tenantId);
          } else {
            const v = (row as Record<string, unknown>)[col];
            rowVals.push(v === undefined ? null : v);
          }
        }
        placeholders.push(`(${rowVals.map(() => `$${idx++}`).join(', ')})`);
        values.push(...rowVals);
      }

      const sql =
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${placeholders.join(', ')} ` +
        `ON CONFLICT (${cols[0]}) DO NOTHING`;
      const res = await client.query(sql, values);
      imported[table] = res.rowCount ?? 0;
    }

    await client.query('COMMIT');
    return { imported, version: (payload as any).version ?? EXPORT_VERSION };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
