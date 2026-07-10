import { queryWithTenant } from '../db/pool.js';
import { decryptField } from '../utils/encryption.js';
import type {
  TimelineEvent,
  StudentProgress,
  StudentProfile,
  StudentCaseSummary,
  RiskLevel,
  CaseType,
  CaseStatus,
} from '@swims/shared';

const RISK_RANK: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export interface TimelineParams {
  from?: string;   // ISO date
  to?: string;     // ISO date
  phase?: string;  // school phase filter
  type?: string;   // event type filter: INCIDENT | INTERVENTION | OBSERVATION | CASE_STATUS_CHANGE
  page: number;
  limit: number;
  anonymize?: boolean;  // for BOARD_MEMBER
}

/**
 * Unified chronological timeline combining cases, incidents,
 * interventions, and positive observations.
 * Uses CTEs for the aggregation query.
 * Includes relevance_weight = 1.0 / (1 + months_since / 12)
 */
export async function getStudentTimeline(
  tenantId: string,
  studentId: string,
  params: TimelineParams,
): Promise<{ events: TimelineEvent[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [tenantId, studentId];
  let paramIdx = 3;

  if (params.from) {
    conditions.push(`event_date >= $${paramIdx++}::TIMESTAMPTZ`);
    values.push(params.from);
  }
  if (params.to) {
    conditions.push(`event_date <= $${paramIdx++}::TIMESTAMPTZ`);
    values.push(params.to);
  }
  if (params.type) {
    conditions.push(`event_type = $${paramIdx++}`);
    values.push(params.type);
  }

  const filterClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const offset = (params.page - 1) * params.limit;

  // Use description or anonymized placeholder based on role
  const descField = params.anonymize
    ? `'[Content restricted]'`
    : 'description';

  const nameField = params.anonymize
    ? `'[Anonymous]'`
    : 'reporter_name';

  const query = `
    WITH timeline_events AS (
      -- Incidents
      SELECT
        i.incident_id AS id,
        'INCIDENT' AS event_type,
        i.incident_at AS event_date,
        i.category,
        i.severity,
        ${params.anonymize ? "'[Content restricted]'" : 'i.description'} AS description,
        ${params.anonymize ? "'[Anonymous]'" : 'u.full_name'} AS reporter_name,
        i.case_id,
        EXTRACT(EPOCH FROM (NOW() - i.incident_at)) / (30.0 * 24 * 3600) AS months_since
      FROM incidents i
      LEFT JOIN users u ON u.user_id = i.reported_by
      WHERE i.student_id = $2 AND i.tenant_id = $1 AND i.deleted_at IS NULL

      UNION ALL

      -- Interventions
      SELECT
        iv.intervention_id AS id,
        'INTERVENTION' AS event_type,
        COALESCE(iv.completed_at, iv.scheduled_at, iv.created_at) AS event_date,
        iv.type AS category,
        NULL AS severity,
        ${params.anonymize ? "'[Content restricted]'" : 'iv.description'} AS description,
        ${params.anonymize ? "'[Anonymous]'" : 'u.full_name'} AS reporter_name,
        iv.case_id,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(iv.completed_at, iv.scheduled_at, iv.created_at))) / (30.0 * 24 * 3600) AS months_since
      FROM interventions iv
      LEFT JOIN users u ON u.user_id = iv.created_by
      WHERE iv.case_id IN (SELECT case_id FROM cases WHERE student_id = $2 AND tenant_id = $1)
        AND iv.tenant_id = $1 AND iv.deleted_at IS NULL

      UNION ALL

      -- Positive observations
      SELECT
        po.observation_id AS id,
        'OBSERVATION' AS event_type,
        po.observed_at AS event_date,
        po.category,
        NULL AS severity,
        ${params.anonymize ? "'[Content restricted]'" : 'po.description'} AS description,
        ${params.anonymize ? "'[Anonymous]'" : 'u.full_name'} AS reporter_name,
        po.case_id,
        EXTRACT(EPOCH FROM (NOW() - po.observed_at)) / (30.0 * 24 * 3600) AS months_since
      FROM positive_observations po
      LEFT JOIN users u ON u.user_id = po.recorded_by
      WHERE po.student_id = $2 AND po.tenant_id = $1 AND po.deleted_at IS NULL

      UNION ALL

      -- Case status changes (from cases table)
      SELECT
        c.case_id AS id,
        'CASE_STATUS_CHANGE' AS event_type,
        c.updated_at AS event_date,
        c.case_type AS category,
        c.risk_level AS severity,
        ${params.anonymize ? "'[Content restricted]'" : "CONCAT('Case status: ', c.status)"} AS description,
        ${params.anonymize ? "'[Anonymous]'" : 'u.full_name'} AS reporter_name,
        c.case_id,
        EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / (30.0 * 24 * 3600) AS months_since
      FROM cases c
      LEFT JOIN users u ON u.user_id = c.created_by
      WHERE c.student_id = $2 AND c.tenant_id = $1 AND c.deleted_at IS NULL
    )
    SELECT *,
      (1.0 / (1.0 + COALESCE(months_since, 0) / 12.0)) AS relevance_weight
    FROM timeline_events
    ${filterClause}
    ORDER BY event_date DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  values.push(params.limit, offset);

  const result = await queryWithTenant<{
    id: string;
    event_type: string;
    event_date: string;
    category: string;
    severity: string | null;
    description: string;
    reporter_name: string | null;
    case_id: string | null;
    relevance_weight: number;
  }>(tenantId, query, values);

  // Count total
  const countQuery = `
    WITH timeline_events AS (
      SELECT i.incident_at AS event_date, 'INCIDENT' AS event_type
      FROM incidents i WHERE i.student_id = $2 AND i.tenant_id = $1 AND i.deleted_at IS NULL
      UNION ALL
      SELECT COALESCE(iv.completed_at, iv.scheduled_at, iv.created_at), 'INTERVENTION'
      FROM interventions iv
      WHERE iv.case_id IN (SELECT case_id FROM cases WHERE student_id = $2 AND tenant_id = $1)
        AND iv.tenant_id = $1 AND iv.deleted_at IS NULL
      UNION ALL
      SELECT po.observed_at, 'OBSERVATION'
      FROM positive_observations po WHERE po.student_id = $2 AND po.tenant_id = $1 AND po.deleted_at IS NULL
      UNION ALL
      SELECT c.updated_at, 'CASE_STATUS_CHANGE'
      FROM cases c WHERE c.student_id = $2 AND c.tenant_id = $1 AND c.deleted_at IS NULL
    )
    SELECT COUNT(*) as count FROM timeline_events
    ${filterClause}
  `;

  // For count query, we use the same values minus the limit/offset at the end
  const countValues = values.slice(0, -2);
  const countResult = await queryWithTenant<{ count: string }>(tenantId, countQuery, countValues);

  const events: TimelineEvent[] = result.rows.map((row) => ({
    id: row.id,
    type: row.event_type as TimelineEvent['type'],
    date: row.event_date,
    category: row.category,
    severity: row.severity ?? undefined,
    description: row.description,
    reported_by_name: row.reporter_name ?? undefined,
    case_id: row.case_id ?? undefined,
    relevance_weight: Number(row.relevance_weight),
  }));

  return {
    events,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

/**
 * Derives a student's overall *progress* from their cases and interventions.
 *
 * Progress is intentionally source-agnostic ("apapun progressnya"): it reflects
 * how far along the student's support journey is, computed from:
 *   - case closure rate   (CLOSED / total cases)
 *   - intervention completion rate (completed / total interventions)
 * The two available components are averaged; if a student has neither cases nor
 * interventions, progress is reported as 0 with has_data = false.
 */
export async function getStudentProgress(
  tenantId: string,
  studentId: string,
): Promise<StudentProgress> {
  // Cases grouped by status + risk
  const casesRes = await queryWithTenant<{
    status: 'OPEN' | 'MONITORING' | 'CLOSED';
    risk_level: RiskLevel | null;
    cnt: string;
  }>(
    tenantId,
    `SELECT status, risk_level, COUNT(*)::int AS cnt
     FROM cases
     WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL
     GROUP BY status, risk_level`,
    [tenantId, studentId],
  );

  let open = 0;
  let monitoring = 0;
  let closed = 0;
  let maxRisk: RiskLevel | null = null;
  let maxRiskRank = -1;

  for (const row of casesRes.rows) {
    const count = Number(row.cnt);
    if (row.status === 'OPEN') open += count;
    else if (row.status === 'MONITORING') monitoring += count;
    else if (row.status === 'CLOSED') closed += count;

    if (row.risk_level && RISK_RANK[row.risk_level]! > maxRiskRank) {
      maxRiskRank = RISK_RANK[row.risk_level]!;
      maxRisk = row.risk_level;
    }
  }

  const casesTotal = open + monitoring + closed;
  const closureRate = casesTotal > 0 ? closed / casesTotal : 0;

  // Interventions (completed vs total) for this student's cases
  const ivRes = await queryWithTenant<{ total: string; completed: string }>(
    tenantId,
    `SELECT COUNT(*)::int AS total, COUNT(completed_at)::int AS completed
     FROM interventions iv
     WHERE iv.case_id IN (SELECT case_id FROM cases WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL)
       AND iv.tenant_id = $1 AND iv.deleted_at IS NULL`,
    [tenantId, studentId],
  );
  const ivTotal = Number(ivRes.rows[0]?.total ?? 0);
  const ivCompleted = Number(ivRes.rows[0]?.completed ?? 0);
  const ivScheduled = ivTotal - ivCompleted;
  const ivCompletionRate = ivTotal > 0 ? ivCompleted / ivTotal : 0;

  // Incidents + observations counts
  const incRes = await queryWithTenant<{ total: string }>(
    tenantId,
    `SELECT COUNT(*)::int AS total FROM incidents WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId, studentId],
  );
  const obsRes = await queryWithTenant<{ total: string }>(
    tenantId,
    `SELECT COUNT(*)::int AS total FROM positive_observations WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId, studentId],
  );
  const incidentsTotal = Number(incRes.rows[0]?.total ?? 0);
  const observationsTotal = Number(obsRes.rows[0]?.total ?? 0);

  // Derived overall progress (average of available components)
  const components: number[] = [];
  if (casesTotal > 0) components.push(closureRate);
  if (ivTotal > 0) components.push(ivCompletionRate);
  const progressPercentage =
    components.length > 0
      ? Math.round((components.reduce((a, b) => a + b, 0) / components.length) * 100)
      : 0;

  return {
    has_data: casesTotal > 0 || ivTotal > 0 || incidentsTotal > 0 || observationsTotal > 0,
    cases: { total: casesTotal, open, monitoring, closed, closure_rate: closureRate },
    interventions: {
      total: ivTotal,
      completed: ivCompleted,
      scheduled: ivScheduled,
      completion_rate: ivCompletionRate,
    },
    incidents: { total: incidentsTotal },
    observations: { total: observationsTotal },
    risk_level: maxRisk,
    progress_percentage: progressPercentage,
  };
}

/**
 * Aggregated student profile used by the Student Profile dialog.
 * Combines basic info, a behavior summary, and a lightweight timeline.
 */
export async function getStudentProfile(
  tenantId: string,
  studentId: string,
): Promise<StudentProfile | null> {
  const studentRes = await queryWithTenant<{
    student_id: string;
    full_name: string;
    national_id: string | null;
  }>(
    tenantId,
    `SELECT student_id, full_name, national_id
     FROM students WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId, studentId],
  );

  const student = studentRes.rows[0];
  if (!student) return null;

  const enrollmentRes = await queryWithTenant<{
    class_name: string | null;
    academic_year: string | null;
  }>(
    tenantId,
    `SELECT class_name, academic_year
     FROM student_enrollment_history
     WHERE student_id = $2 AND tenant_id = $1
     ORDER BY enrolled_at DESC NULLS LAST LIMIT 1`,
    [tenantId, studentId],
  );
  const enrollment = enrollmentRes.rows[0] ?? { class_name: null, academic_year: null };

  // Behavior summary
  const caseSummary = await queryWithTenant<{
    active: string;
    risk_level: RiskLevel | null;
  }>(
    tenantId,
    `SELECT
       COUNT(*) FILTER (WHERE status <> 'CLOSED')::int AS active,
       MAX(risk_level) AS risk_level
     FROM cases WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId, studentId],
  );
  const activeCases = Number(caseSummary.rows[0]?.active ?? 0);

  // MAX(risk_level) over TEXT is alphabetical and wrong; recompute via ranking
  const riskRows = await queryWithTenant<{ risk_level: RiskLevel | null }>(
    tenantId,
    `SELECT risk_level FROM cases WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL AND status <> 'CLOSED'`,
    [tenantId, studentId],
  );
  let riskLevel: RiskLevel = 'LOW';
  let rank = -1;
  for (const r of riskRows.rows) {
    if (r.risk_level && RISK_RANK[r.risk_level]! > rank) {
      rank = RISK_RANK[r.risk_level]!;
      riskLevel = r.risk_level;
    }
  }

  const incRes = await queryWithTenant<{ total: string; last_date: string | null }>(
    tenantId,
    `SELECT COUNT(*)::int AS total, MAX(incident_at) AS last_date
     FROM incidents WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId, studentId],
  );
  const obsRes = await queryWithTenant<{ total: string }>(
    tenantId,
    `SELECT COUNT(*)::int AS total FROM positive_observations WHERE student_id = $2 AND tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId, studentId],
  );

  // Lightweight timeline (reuse the full timeline service)
  const { events } = await getStudentTimeline(tenantId, studentId, {
    page: 1,
    limit: 50,
  });
  const timeline = events.map((e) => ({
    date: e.date,
    type: e.type,
    status:
      e.type === 'INTERVENTION'
        ? e.severity
          ? e.severity
          : 'RECORDED'
        : e.type === 'CASE_STATUS_CHANGE'
          ? e.category
          : e.severity ?? 'RECORDED',
    handled_by: e.reported_by_name ?? '-',
  }));

  let nationalId: string | null = null;
  if (student.national_id) {
    try {
      nationalId = decryptField(student.national_id);
    } catch {
      nationalId = null;
    }
  }

  return {
    student_id: student.student_id,
    full_name: student.full_name,
    national_id: nationalId,
    enrollment: {
      class_name: enrollment.class_name,
      academic_year: enrollment.academic_year,
    },
    summary: {
      total_active_cases: activeCases,
      total_incidents: Number(incRes.rows[0]?.total ?? 0),
      risk_level: riskLevel,
      positive_count: Number(obsRes.rows[0]?.total ?? 0),
      last_incident_date: incRes.rows[0]?.last_date ?? null,
    },
    timeline,
  };
}

/**
 * Returns every case belonging to a student, with lightweight rollups
 * (incident count, intervention count, latest incident date). This is what the
 * Student Timeline page lists so a counselor can see ALL of a student's cases
 * in one place and drill into any of them.
 */
export async function getStudentCases(
  tenantId: string,
  studentId: string,
): Promise<StudentCaseSummary[]> {
  const res = await queryWithTenant<{
    case_id: string;
    case_type: CaseType;
    status: CaseStatus;
    risk_level: RiskLevel;
    opened_date: string | null;
    closed_date: string | null;
    summary: string | null;
    assigned_counselor_name: string | null;
    incident_count: string;
    intervention_count: string;
    latest_incident_at: string | null;
  }>(
    tenantId,
    `SELECT
       c.case_id,
       c.case_type,
       c.status,
       c.risk_level,
       c.opened_date,
       c.closed_date,
       c.summary,
       u.full_name AS assigned_counselor_name,
       (SELECT COUNT(*)::int FROM incidents i
          WHERE i.case_id = c.case_id AND i.tenant_id = $1 AND i.deleted_at IS NULL) AS incident_count,
       (SELECT COUNT(*)::int FROM interventions iv
          WHERE iv.case_id = c.case_id AND iv.tenant_id = $1 AND iv.deleted_at IS NULL) AS intervention_count,
       (SELECT MAX(i2.incident_at) FROM incidents i2
          WHERE i2.case_id = c.case_id AND i2.tenant_id = $1 AND i2.deleted_at IS NULL) AS latest_incident_at
     FROM cases c
     LEFT JOIN users u ON u.user_id = c.assigned_counselor
     WHERE c.student_id = $2 AND c.tenant_id = $1 AND c.deleted_at IS NULL
     ORDER BY
       CASE c.status WHEN 'OPEN' THEN 0 WHEN 'MONITORING' THEN 1 WHEN 'CLOSED' THEN 2 END,
       c.opened_date DESC NULLS LAST`,
    [tenantId, studentId],
  );

  return res.rows.map((r) => ({
    case_id: r.case_id,
    case_type: r.case_type,
    status: r.status,
    risk_level: r.risk_level,
    opened_date: r.opened_date,
    closed_date: r.closed_date,
    summary: r.summary,
    assigned_counselor_name: r.assigned_counselor_name,
    incident_count: Number(r.incident_count),
    intervention_count: Number(r.intervention_count),
    latest_incident_at: r.latest_incident_at,
  }));
}
