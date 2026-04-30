import { queryWithTenant } from '../db/pool.js';
import type { TimelineEvent } from '@swims/shared';

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
