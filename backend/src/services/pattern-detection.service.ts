import { queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';

// ─── Pattern Detection Engine ────────────────────────────────────────────────

export async function runPatternDetectionForTenant(tenantId: string): Promise<void> {
  await Promise.all([
    detectRapidEscalation(tenantId),
    detectRepeatedSameCategory(tenantId),
    detectAbsenceOfIntervention(tenantId),
    detectCriticalIncidentNoFollowup(tenantId),
  ]);
}

// Helper to silently insert an alert if it doesn't already exist
async function insertAlertIfNotExists(
  tenantId: string,
  studentId: string,
  ruleName: string,
  severity: string,
  expiresInDays: number,
  patternData: Record<string, unknown>
) {
  const { rows } = await queryWithTenant(
    tenantId,
    `INSERT INTO alerts (tenant_id, student_id, triggered_by, pattern_data, severity, expires_at)
     SELECT $1, $2, $3, $4::jsonb, $5, now() + ($6 || ' days')::interval
     WHERE NOT EXISTS (
       SELECT 1 FROM alerts 
       WHERE tenant_id = $1 AND student_id = $2 AND triggered_by = $3 AND status = 'PENDING'
     )
     RETURNING alert_id`,
    [tenantId, studentId, ruleName, JSON.stringify(patternData), severity, expiresInDays]
  );

  if (rows.length > 0) {
    await auditLog({
      action: 'ALERT_GENERATED',
      entityType: 'alerts',
      entityId: (rows[0] as { alert_id: string }).alert_id,
      after: {
        student_id: studentId,
        rule: ruleName,
        severity,
      },
      tenantId,
      actorId: 'SYSTEM', // System Cron job
    });
  }
}

// ─── RAPID_ESCALATION ─────────────────────────────────────────────────────────
// Condition: Student has 3+ incidents of increasing severity within 14 days

async function detectRapidEscalation(tenantId: string) {
  const { rows } = await queryWithTenant<{ student_id: string; incidents: any[] }>(
    tenantId,
    `WITH numeric_severity AS (
       SELECT *,
         CASE severity
           WHEN 'LOW' THEN 1
           WHEN 'MEDIUM' THEN 2
           WHEN 'HIGH' THEN 3
           WHEN 'CRITICAL' THEN 4
         END as sev_num
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND incident_at >= now() - INTERVAL '14 days'
     ),
     ranked AS (
       SELECT student_id, incident_id, sev_num, incident_at,
              LAG(sev_num, 1) OVER (PARTITION BY student_id ORDER BY incident_at ASC) as prev_1_sev,
              LAG(sev_num, 2) OVER (PARTITION BY student_id ORDER BY incident_at ASC) as prev_2_sev
       FROM numeric_severity
     )
     SELECT student_id, json_agg(incident_id) as incidents FROM ranked
     WHERE prev_2_sev IS NOT NULL 
       AND prev_1_sev > prev_2_sev 
       AND sev_num > prev_1_sev
     GROUP BY student_id
     `,
    [tenantId]
  );

  for (const row of rows) {
    await insertAlertIfNotExists(
      tenantId,
      row.student_id,
      'RAPID_ESCALATION',
      'HIGH',
      7,
      { mapped_incidents: row.incidents }
    );
  }
}

// ─── REPEATED_SAME_CATEGORY ──────────────────────────────────────────────────
// Condition: Student has 4+ incidents of the same category within 30 days

async function detectRepeatedSameCategory(tenantId: string) {
  const { rows } = await queryWithTenant<{ student_id: string; category: string; count: string }>(
    tenantId,
    `SELECT student_id, category, COUNT(*) as count 
     FROM incidents
     WHERE tenant_id = $1 AND deleted_at IS NULL
       AND incident_at >= now() - INTERVAL '30 days'
     GROUP BY student_id, category
     HAVING COUNT(*) >= 4`,
    [tenantId]
  );

  for (const row of rows) {
    await insertAlertIfNotExists(
      tenantId,
      row.student_id,
      'REPEATED_SAME_CATEGORY',
      'MEDIUM',
      5,
      { category: row.category, recent_count: parseInt(row.count, 10) }
    );
  }
}

// ─── ABSENCE_OF_INTERVENTION ────────────────────────────────────────────────
// Condition: OPEN case with HIGH/CRITICAL risk has no intervention in 10 days

async function detectAbsenceOfIntervention(tenantId: string) {
  const { rows } = await queryWithTenant<{ student_id: string; case_id: string }>(
    tenantId,
    `SELECT c.student_id, c.case_id 
     FROM cases c
     WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
       AND c.status = 'OPEN' 
       AND c.risk_level IN ('HIGH', 'CRITICAL')
       AND NOT EXISTS (
         SELECT 1 FROM interventions i 
         WHERE i.case_id = c.case_id AND i.deleted_at IS NULL
           AND i.created_at >= now() - INTERVAL '10 days'
       )`,
    [tenantId]
  );

  for (const row of rows) {
    await insertAlertIfNotExists(
      tenantId,
      row.student_id,
      'ABSENCE_OF_INTERVENTION',
      'HIGH',
      3,
      { target_case: row.case_id }
    );
  }
}

// ─── CRITICAL_INCIDENT_NO_FOLLOWUP ──────────────────────────────────────────
// Condition: CRITICAL severity incident > 24 hours ago, no linked intervention

async function detectCriticalIncidentNoFollowup(tenantId: string) {
  const { rows } = await queryWithTenant<{ student_id: string; incident_id: string }>(
    tenantId,
    `SELECT student_id, incident_id 
     FROM incidents inc
     WHERE inc.tenant_id = $1 AND inc.deleted_at IS NULL
       AND inc.severity = 'CRITICAL'
       AND inc.incident_at <= now() - INTERVAL '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM interventions i 
         WHERE i.incident_id = inc.incident_id AND i.deleted_at IS NULL
       )`,
    [tenantId]
  );

  for (const row of rows) {
    await insertAlertIfNotExists(
      tenantId,
      row.student_id,
      'CRITICAL_INCIDENT_NO_FOLLOWUP',
      'CRITICAL',
      2, // 48 hours is roughly 2 days expiry
      { triggering_incident: row.incident_id }
    );
  }
}
