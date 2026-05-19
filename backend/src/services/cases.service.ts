import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import type { CaseRow, RiskLevel } from '@swims/shared';
import type { Request } from 'express';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateCaseInput {
  student_id: string;
  case_type: string;
  risk_level?: string;
  assigned_counselor?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateCaseInput {
  status?: string;
  risk_level?: string;
  risk_level_source?: string;
  assigned_counselor?: string | null;
  summary?: string;
  closed_date?: string;
  metadata?: Record<string, unknown>;
}

export interface ListCasesParams {
  status?: string;
  risk_level?: string;
  student_id?: string;
  case_type?: string;
  page: number;
  limit: number;
  medicalOnly?: boolean;
  teacher_id?: string;
}

// ─── Create Case ─────────────────────────────────────────────────────────────

export async function createCase(
  tenantId: string,
  input: CreateCaseInput,
  createdBy: string,
  req?: Request,
): Promise<CaseRow> {
  const client = await getClientWithTenant(tenantId);

  try {
    await client.query('BEGIN');

    // Get current enrollment phase for snapshot
    const { rows: enrollments } = await client.query<{ school_phase: string }>(
      `SELECT school_phase FROM student_enrollment_history
       WHERE student_id = $1 AND tenant_id = $2 AND graduated_at IS NULL
       ORDER BY enrolled_at DESC LIMIT 1`,
      [input.student_id, tenantId],
    );
    const phaseRef = enrollments[0]?.school_phase ?? null;

    const { rows } = await client.query<CaseRow>(
      `INSERT INTO cases (tenant_id, student_id, case_type, risk_level, assigned_counselor, school_phase_ref, summary, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId,
        input.student_id,
        input.case_type,
        input.risk_level ?? 'LOW',
        input.assigned_counselor ?? null,
        phaseRef,
        input.summary ?? null,
        JSON.stringify(input.metadata ?? {}),
        createdBy,
      ],
    );

    await client.query('COMMIT');

    const created = rows[0]!;

    await auditLog({
      action: 'CASE_CREATED',
      entityType: 'cases',
      entityId: created.case_id,
      after: created as unknown as Record<string, unknown>,
      req,
      tenantId,
      actorId: createdBy,
    });

    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── List Cases ──────────────────────────────────────────────────────────────

export async function listCases(
  tenantId: string,
  params: ListCasesParams,
): Promise<{ cases: CaseRow[]; total: number }> {
  const conditions: string[] = ['c.deleted_at IS NULL'];
  const values: unknown[] = [tenantId];
  let paramIdx = 2;

  if (params.status) {
    conditions.push(`c.status = $${paramIdx++}`);
    values.push(params.status);
  }
  if (params.risk_level) {
    conditions.push(`c.risk_level = $${paramIdx++}`);
    values.push(params.risk_level);
  }
  if (params.student_id) {
    conditions.push(`c.student_id = $${paramIdx++}`);
    values.push(params.student_id);
  }
  if (params.case_type) {
    conditions.push(`c.case_type = $${paramIdx++}`);
    values.push(params.case_type);
  }
  if (params.medicalOnly) {
    conditions.push(`c.case_type = 'MEDICAL'`);
  }
  if (params.teacher_id) {
    conditions.push(`EXISTS (
      SELECT 1 FROM incidents i 
      WHERE i.case_id = c.case_id 
      AND i.reported_by = $${paramIdx++}
      AND i.deleted_at IS NULL
    )`);
    values.push(params.teacher_id);
  }

  const whereClause = conditions.join(' AND ');
  const offset = (params.page - 1) * params.limit;

  // Count total
  const countResult = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) as count FROM cases c WHERE c.tenant_id = $1 AND ${whereClause}`,
    values,
  );

  // Fetch page
  const dataResult = await queryWithTenant<CaseRow & { student_name: string }>(
    tenantId,
    `SELECT c.*, s.full_name as student_name 
     FROM cases c
     JOIN students s ON s.student_id = c.student_id
     WHERE c.tenant_id = $1 AND ${whereClause}
     ORDER BY
       CASE c.risk_level WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
       c.updated_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...values, params.limit, offset],
  );

  return {
    cases: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// ─── Get Case by ID ─────────────────────────────────────────────────────────

export async function getCaseById(tenantId: string, caseId: string): Promise<CaseRow> {
  const { rows } = await queryWithTenant<CaseRow>(
    tenantId,
    `SELECT * FROM cases WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [caseId, tenantId],
  );

  if (rows.length === 0) {
    throw new NotFoundError('Case', caseId);
  }

  return rows[0]!;
}

// ─── Update Case ─────────────────────────────────────────────────────────────

export async function updateCase(
  tenantId: string,
  caseId: string,
  input: UpdateCaseInput,
  actorId: string,
  req?: Request,
): Promise<CaseRow> {
  const before = await getCaseById(tenantId, caseId);

  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [caseId, tenantId];
  let paramIdx = 3;

  if (input.status !== undefined) {
    setClauses.push(`status = $${paramIdx++}`);
    values.push(input.status);
    if (input.status === 'CLOSED') {
      setClauses.push(`closed_date = CURRENT_DATE`);
    }
  }
  if (input.risk_level !== undefined) {
    setClauses.push(`risk_level = $${paramIdx++}`);
    values.push(input.risk_level);
  }
  if (input.risk_level_source !== undefined) {
    setClauses.push(`risk_level_source = $${paramIdx++}`);
    values.push(input.risk_level_source);
  }
  if (input.assigned_counselor !== undefined) {
    setClauses.push(`assigned_counselor = $${paramIdx++}`);
    values.push(input.assigned_counselor);
  }
  if (input.summary !== undefined) {
    setClauses.push(`summary = $${paramIdx++}`);
    values.push(input.summary);
  }
  if (input.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx++}`);
    values.push(JSON.stringify(input.metadata));
  }

  const { rows } = await queryWithTenant<CaseRow>(
    tenantId,
    `UPDATE cases SET ${setClauses.join(', ')}
     WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  if (rows.length === 0) {
    throw new NotFoundError('Case', caseId);
  }

  const updated = rows[0]!;

  await auditLog({
    action: 'CASE_UPDATED',
    entityType: 'cases',
    entityId: caseId,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return updated;
}

// ─── Soft Delete Case ────────────────────────────────────────────────────────

export async function softDeleteCase(
  tenantId: string,
  caseId: string,
  actorId: string,
  req?: Request,
): Promise<void> {
  const before = await getCaseById(tenantId, caseId);

  const { rowCount } = await queryWithTenant(
    tenantId,
    `UPDATE cases SET deleted_at = now(), updated_at = now()
     WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [caseId, tenantId],
  );

  if (rowCount === 0) {
    throw new NotFoundError('Case', caseId);
  }

  await auditLog({
    action: 'CASE_DELETED',
    entityType: 'cases',
    entityId: caseId,
    before: before as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });
}

// ─── Risk Level Auto-Calculation (Section 6.1) ──────────────────────────────

export async function recalculateRiskLevel(
  tenantId: string,
  caseId: string,
  studentId: string,
  req?: Request,
): Promise<RiskLevel> {
  // Check if manual override is locked
  const caseRow = await getCaseById(tenantId, caseId);
  if (caseRow.risk_level_source === 'MANUAL') {
    // Manual override is active — do not auto-recalculate
    return caseRow.risk_level;
  }

  // Count incidents in the last 30 days for this student
  const { rows } = await queryWithTenant<{ severity: string; cnt: string }>(
    tenantId,
    `SELECT severity, COUNT(*) as cnt
     FROM incidents
     WHERE student_id = $1
       AND tenant_id = $2
       AND deleted_at IS NULL
       AND incident_at >= NOW() - INTERVAL '30 days'
     GROUP BY severity`,
    [studentId, tenantId],
  );

  let newRisk: RiskLevel = 'LOW';

  const severityCounts: Record<string, number> = {};
  for (const row of rows) {
    severityCounts[row.severity] = Number(row.cnt);
  }

  // Rule: If any incident is CRITICAL → case risk = CRITICAL
  if ((severityCounts['CRITICAL'] ?? 0) > 0) {
    newRisk = 'CRITICAL';
  }
  // Rule: If 3+ HIGH incidents in 30 days → case risk = HIGH
  else if ((severityCounts['HIGH'] ?? 0) >= 3) {
    newRisk = 'HIGH';
  }
  // Rule: If 5+ MEDIUM incidents in 30 days → case risk = HIGH
  else if ((severityCounts['MEDIUM'] ?? 0) >= 5) {
    newRisk = 'HIGH';
  }

  // Update case risk level if changed
  if (newRisk !== caseRow.risk_level) {
    await updateCase(
      tenantId,
      caseId,
      { risk_level: newRisk, risk_level_source: 'AUTO' },
      'SYSTEM',
      req,
    );
  }

  return newRisk;
}
