import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { NotFoundError } from '../utils/errors.js';
import { recalculateRiskLevel } from './cases.service.js';
import type { IncidentRow } from '@swims/shared';
import type { Request } from 'express';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateIncidentInput {
  case_id: string;
  student_id: string;
  category: string;
  sub_category?: string;
  severity: string;
  description: string;
  location?: string;
  incident_at: string;
  witnesses?: Array<{ user_id?: string; name: string; statement?: string }>;
  immediate_actions?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateIncidentInput {
  category?: string;
  sub_category?: string;
  severity?: string;
  description?: string;
  location?: string;
  incident_at?: string;
  witnesses?: Array<{ user_id?: string; name: string; statement?: string }>;
  immediate_actions?: string;
  language_flag?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ListIncidentsParams {
  case_id?: string;
  severity?: string;
  reported_by?: string;
  page: number;
  limit: number;
  medicalOnly?: boolean;
}

// ─── Create Incident ─────────────────────────────────────────────────────────

export async function createIncident(
  tenantId: string,
  input: CreateIncidentInput,
  reportedBy: string,
  req?: Request,
): Promise<IncidentRow> {
  const client = await getClientWithTenant(tenantId);

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<IncidentRow>(
      `INSERT INTO incidents (
        tenant_id, case_id, student_id, category, sub_category, severity,
        description, location, incident_at, reported_by, witnesses, immediate_actions, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        tenantId,
        input.case_id,
        input.student_id,
        input.category,
        input.sub_category ?? null,
        input.severity,
        input.description,
        input.location ?? null,
        input.incident_at,
        reportedBy,
        JSON.stringify(input.witnesses ?? []),
        input.immediate_actions ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    await client.query('COMMIT');

    const created = rows[0]!;

    // Audit log
    await auditLog({
      action: 'INCIDENT_CREATED',
      entityType: 'incidents',
      entityId: created.incident_id,
      after: created as unknown as Record<string, unknown>,
      req,
      tenantId,
      actorId: reportedBy,
    });

    // Trigger risk level recalculation on the parent case
    await recalculateRiskLevel(tenantId, input.case_id, input.student_id, req);

    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── List Incidents ──────────────────────────────────────────────────────────

export async function listIncidents(
  tenantId: string,
  params: ListIncidentsParams,
): Promise<{ incidents: IncidentRow[]; total: number }> {
  const conditions: string[] = ['i.deleted_at IS NULL'];
  const values: unknown[] = [tenantId];
  let paramIdx = 2;

  if (params.case_id) {
    conditions.push(`i.case_id = $${paramIdx++}`);
    values.push(params.case_id);
  }
  if (params.severity) {
    conditions.push(`i.severity = $${paramIdx++}`);
    values.push(params.severity);
  }
  if (params.reported_by) {
    conditions.push(`i.reported_by = $${paramIdx++}`);
    values.push(params.reported_by);
  }
  if (params.medicalOnly) {
    // Filter to medical-related categories (ABAC for SCHOOL_NURSE)
    conditions.push(`i.category ILIKE '%medical%'`);
  }

  const whereClause = conditions.join(' AND ');
  const offset = (params.page - 1) * params.limit;

  const countResult = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) as count FROM incidents i WHERE i.tenant_id = $1 AND ${whereClause}`,
    values,
  );

  const dataResult = await queryWithTenant<IncidentRow & { reporter_name: string }>(
    tenantId,
    `SELECT i.*, u.full_name AS reporter_name
     FROM incidents i
     LEFT JOIN users u ON u.user_id = i.reported_by
     WHERE i.tenant_id = $1 AND ${whereClause}
     ORDER BY i.incident_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...values, params.limit, offset],
  );

  return {
    incidents: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// ─── Get Distinct Students from My Reports ───────────────────────────────────

export interface MyStudentRow {
  student_id: string;
  full_name: string;
  incident_count: number;
  last_incident_at: string;
  last_severity: string;
}

export async function getMyStudents(
  tenantId: string,
  reportedBy: string,
): Promise<MyStudentRow[]> {
  const { rows } = await queryWithTenant<MyStudentRow>(
    tenantId,
    `SELECT
       i.student_id,
       s.full_name,
       COUNT(i.incident_id)::int  AS incident_count,
       MAX(i.incident_at)         AS last_incident_at,
       (SELECT severity FROM incidents
        WHERE student_id = i.student_id
          AND reported_by = $2
          AND tenant_id = $1
          AND deleted_at IS NULL
        ORDER BY incident_at DESC LIMIT 1) AS last_severity
     FROM incidents i
     JOIN students s ON s.student_id = i.student_id
     WHERE i.tenant_id = $1
       AND i.reported_by = $2
       AND i.deleted_at IS NULL
     GROUP BY i.student_id, s.full_name
     ORDER BY last_incident_at DESC`,
    [tenantId, reportedBy],
  );

  return rows;
}

// ─── Get Incident by ID ─────────────────────────────────────────────────────

export async function getIncidentById(
  tenantId: string,
  incidentId: string,
): Promise<IncidentRow> {
  const { rows } = await queryWithTenant<IncidentRow>(
    tenantId,
    `SELECT * FROM incidents WHERE incident_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );

  if (rows.length === 0) {
    throw new NotFoundError('Incident', incidentId);
  }

  return rows[0]!;
}

// ─── Update Incident ─────────────────────────────────────────────────────────

export async function updateIncident(
  tenantId: string,
  incidentId: string,
  input: UpdateIncidentInput,
  actorId: string,
  req?: Request,
): Promise<IncidentRow> {
  const before = await getIncidentById(tenantId, incidentId);

  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [incidentId, tenantId];
  let paramIdx = 3;

  if (input.category !== undefined) {
    setClauses.push(`category = $${paramIdx++}`);
    values.push(input.category);
  }
  if (input.sub_category !== undefined) {
    setClauses.push(`sub_category = $${paramIdx++}`);
    values.push(input.sub_category);
  }
  if (input.severity !== undefined) {
    setClauses.push(`severity = $${paramIdx++}`);
    values.push(input.severity);
  }
  if (input.description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`);
    values.push(input.description);
  }
  if (input.location !== undefined) {
    setClauses.push(`location = $${paramIdx++}`);
    values.push(input.location);
  }
  if (input.incident_at !== undefined) {
    setClauses.push(`incident_at = $${paramIdx++}`);
    values.push(input.incident_at);
  }
  if (input.witnesses !== undefined) {
    setClauses.push(`witnesses = $${paramIdx++}`);
    values.push(JSON.stringify(input.witnesses));
  }
  if (input.immediate_actions !== undefined) {
    setClauses.push(`immediate_actions = $${paramIdx++}`);
    values.push(input.immediate_actions);
  }
  if (input.language_flag !== undefined) {
    setClauses.push(`language_flag = $${paramIdx++}`);
    values.push(input.language_flag);
  }
  if (input.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx++}`);
    values.push(JSON.stringify(input.metadata));
  }

  const { rows } = await queryWithTenant<IncidentRow>(
    tenantId,
    `UPDATE incidents SET ${setClauses.join(', ')}
     WHERE incident_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  if (rows.length === 0) {
    throw new NotFoundError('Incident', incidentId);
  }

  const updated = rows[0]!;

  await auditLog({
    action: 'INCIDENT_UPDATED',
    entityType: 'incidents',
    entityId: incidentId,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  // Recalculate risk if severity changed
  if (input.severity && input.severity !== before.severity) {
    await recalculateRiskLevel(tenantId, before.case_id, before.student_id, req);
  }

  return updated;
}

// ─── Soft Delete Incident ────────────────────────────────────────────────────

export async function softDeleteIncident(
  tenantId: string,
  incidentId: string,
  actorId: string,
  req?: Request,
): Promise<void> {
  const before = await getIncidentById(tenantId, incidentId);

  const { rowCount } = await queryWithTenant(
    tenantId,
    `UPDATE incidents SET deleted_at = now(), updated_at = now()
     WHERE incident_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );

  if (rowCount === 0) {
    throw new NotFoundError('Incident', incidentId);
  }

  await auditLog({
    action: 'INCIDENT_DELETED',
    entityType: 'incidents',
    entityId: incidentId,
    before: before as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });
}
