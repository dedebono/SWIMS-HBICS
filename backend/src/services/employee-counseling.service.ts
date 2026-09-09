import { queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import {
  EmployeeCounselingSubmissionRow,
  EmployeeCounselingSessionRow,
  EmployeeCounselingAccessLogRow,
  EmployeeCounselingSubmissionWithCounselor,
  EmployeeCounselingAccessLogWithUser,
  CreateSubmissionInput,
  CreateSessionNoteInput,
  CloseSubmissionInput,
  AssignCounselorInput,
  EmployeeCounselingSubmissionStatus,
} from '@swims/shared';
import type { Role } from '@swims/shared';
import { sendHighPriorityAlert } from './notifications.service.js';

// ─── HIGH PRIORITY DETECTION ──────────────────────────────────────────────────

function detectHighPriority(answers: CreateSubmissionInput['answers']): boolean {
  return (
    answers.q8_safety_threat === 'ya' ||
    answers.q8_safety_threat === 'tidak_yakin' ||
    answers.q9_bantuan_segera === 'ya' ||
    answers.q9_bantuan_segera === 'tidak_yakin'
  );
}

// ─── SUBMIT INTAKE ───────────────────────────────────────────────────────────

export async function submitIntake(
  tenantId: string,
  data: CreateSubmissionInput,
  submittedBy: string,
): Promise<EmployeeCounselingSubmissionRow> {
  const isHighPriority = detectHighPriority(data.answers);

  const { rows } = await queryWithTenant<EmployeeCounselingSubmissionRow>(
    tenantId,
    `INSERT INTO employee_counseling_submissions
       (tenant_id, employee_name, unit, position, contact_number, answers, consents,
        is_high_priority, submitted_by, submission_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted')
     RETURNING *`,
    [
      tenantId,
      data.employee_name,
      data.unit ?? null,
      data.position ?? null,
      data.contact_number ?? null,
      JSON.stringify(data.answers),
      JSON.stringify(data.consents),
      isHighPriority,
      submittedBy,
    ],
  );

  const submission = rows[0]!;

  await auditLog({
    action: 'EMPLOYEE_COUNSELING_SUBMITTED',
    entityType: 'employee_counseling_submissions',
    entityId: submission.submission_id,
    after: { is_high_priority: isHighPriority } as unknown as Record<string, unknown>,
    tenantId,
    actorId: submittedBy,
  });

  // Trigger HIGH PRIORITY alert if needed
  if (isHighPriority) {
    await sendHighPriorityAlert(tenantId, {
      type: 'employee_counseling',
      submission_id: submission.submission_id,
      employee_name: data.employee_name,
      reason: `Kondisi high priority terdeteksi: q8=${data.answers.q8_safety_threat}, q9=${data.answers.q9_bantuan_segera}`,
    });
  }

  return submission;
}

// ─── LIST SUBMISSIONS ─────────────────────────────────────────────────────────

export async function listSubmissions(
  tenantId: string,
  filters: {
    status?: EmployeeCounselingSubmissionStatus;
    is_high_priority?: boolean;
    assigned_counselor_id?: string | null;
  },
  userId: string,
  role: Role,
  limit = 50,
  offset = 0,
): Promise<{ submissions: EmployeeCounselingSubmissionWithCounselor[]; total: number }> {
  let sql = `
    SELECT s.*,
           u_c.full_name AS counselor_name,
           u_s.full_name AS submitted_by_name
    FROM employee_counseling_submissions s
    LEFT JOIN users u_c ON u_c.user_id = s.assigned_counselor_id
    LEFT JOIN users u_s ON u_s.user_id = s.submitted_by
    WHERE s.tenant_id = $1 AND s.deleted_at IS NULL
  `;
  const params: unknown[] = [tenantId];
  let p = 2;

  if (filters.status) {
    sql += ` AND s.submission_status = $${p++}`;
    params.push(filters.status);
  }
  if (filters.is_high_priority !== undefined) {
    sql += ` AND s.is_high_priority = $${p++}`;
    params.push(filters.is_high_priority);
  }
  if (filters.assigned_counselor_id !== undefined) {
    if (filters.assigned_counselor_id === null) {
      sql += ` AND s.assigned_counselor_id IS NULL`;
    } else {
      sql += ` AND s.assigned_counselor_id = $${p++}`;
      params.push(filters.assigned_counselor_id);
    }
  }

  // RBAC: employees see only their own submissions
  const viewerRoles: Role[] = ['COUNSELOR', 'PSYCHOLOGIST', 'IT_ADMIN', 'SCHOOL_HEAD'];
  if (!viewerRoles.includes(role)) {
    sql += ` AND s.submitted_by = $${p++}`;
    params.push(userId);
  }

  // Count
  const countSql = sql.replace(
    /SELECT s\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) FROM',
  );
  const { rows: countRows } = await queryWithTenant<{ count: string }>(
    tenantId,
    countSql,
    params,
  );
  const total = parseInt(countRows[0]?.count ?? '0', 10);

  // Paginated
  sql += ` ORDER BY s.is_high_priority DESC, s.submitted_at DESC LIMIT $${p++} OFFSET $${p++}`;
  params.push(limit, offset);

  const { rows } = await queryWithTenant<EmployeeCounselingSubmissionWithCounselor>(
    tenantId,
    sql,
    params,
  );

  return { submissions: rows, total };
}

// ─── GET SUBMISSION ────────────────────────────────────────────────────────────

export async function getSubmission(
  tenantId: string,
  submissionId: string,
): Promise<EmployeeCounselingSubmissionRow | null> {
  const { rows } = await queryWithTenant<EmployeeCounselingSubmissionRow>(
    tenantId,
    `SELECT * FROM employee_counseling_submissions
     WHERE tenant_id = $1 AND submission_id = $2 AND deleted_at IS NULL`,
    [tenantId, submissionId],
  );
  return rows[0] ?? null;
}

// ─── ASSIGN COUNSELOR ─────────────────────────────────────────────────────────

export async function assignCounselor(
  tenantId: string,
  submissionId: string,
  input: AssignCounselorInput,
  actorId: string,
): Promise<EmployeeCounselingSubmissionRow | null> {
  // If assigning, update status to in_progress
  const newStatus = input.counselor_id ? 'in_progress' : 'submitted';

  const { rows } = await queryWithTenant<EmployeeCounselingSubmissionRow>(
    tenantId,
    `UPDATE employee_counseling_submissions
     SET assigned_counselor_id = $1, submission_status = $2, updated_at = now()
     WHERE tenant_id = $3 AND submission_id = $4 AND deleted_at IS NULL
     RETURNING *`,
    [input.counselor_id, newStatus, tenantId, submissionId],
  );

  const updated = rows[0] ?? null;
  if (updated) {
    await auditLog({
      action: 'EMPLOYEE_COUNSELING_COUNSELOR_ASSIGNED',
      entityType: 'employee_counseling_submissions',
      entityId: submissionId,
      after: { assigned_counselor_id: input.counselor_id, submission_status: newStatus },
      tenantId,
      actorId,
    });
  }
  return updated;
}

// ─── CREATE SESSION NOTE ─────────────────────────────────────────────────────

export async function createSession(
  tenantId: string,
  data: CreateSessionNoteInput,
  actorId: string,
): Promise<EmployeeCounselingSessionRow> {
  // Get next session number
  const { rows: countRows } = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) AS count FROM employee_counseling_sessions
     WHERE tenant_id = $1 AND submission_id = $2 AND deleted_at IS NULL`,
    [tenantId, data.submission_id],
  );
  const sessionNumber = parseInt(countRows[0]?.count ?? '0', 10) + 1;

  const { rows } = await queryWithTenant<EmployeeCounselingSessionRow>(
    tenantId,
    `INSERT INTO employee_counseling_sessions
       (tenant_id, submission_id, session_number, session_date, session_time, method,
        section_1_info, section_2_presenting_concern, section_3_key_points,
        section_4_observation, section_5_intervention, section_6_employee_insight,
        section_7_action_plan, section_8_risk, section_9_followup, section_10_closure)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      tenantId,
      data.submission_id,
      sessionNumber,
      data.session_date ?? null,
      data.session_time ?? null,
      data.method ?? null,
      JSON.stringify(data.section_1_info),
      data.section_2_presenting_concern ?? null,
      JSON.stringify(data.section_3_key_points),
      data.section_4_observation ?? null,
      JSON.stringify(data.section_5_intervention),
      data.section_6_employee_insight ?? null,
      JSON.stringify(data.section_7_action_plan),
      JSON.stringify(data.section_8_risk),
      JSON.stringify(data.section_9_followup),
      data.section_10_closure ? JSON.stringify(data.section_10_closure) : null,
    ],
  );

  const session = rows[0]!;

  await auditLog({
    action: 'EMPLOYEE_COUNSELING_SESSION_CREATED',
    entityType: 'employee_counseling_sessions',
    entityId: session.session_id,
    after: { submission_id: data.submission_id, session_number: sessionNumber },
    tenantId,
    actorId,
  });

  return session;
}

// ─── UPDATE SESSION NOTE ─────────────────────────────────────────────────────

export async function updateSession(
  tenantId: string,
  sessionId: string,
  data: Partial<CreateSessionNoteInput>,
  actorId: string,
): Promise<EmployeeCounselingSessionRow | null> {
  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  let idx = 1;

  if (data.session_date !== undefined) { setClauses.push(`session_date = $${idx++}`); values.push(data.session_date ?? null); }
  if (data.session_time !== undefined) { setClauses.push(`session_time = $${idx++}`); values.push(data.session_time ?? null); }
  if (data.method !== undefined) { setClauses.push(`method = $${idx++}`); values.push(data.method ?? null); }
  if (data.section_1_info !== undefined) { setClauses.push(`section_1_info = $${idx++}`); values.push(JSON.stringify(data.section_1_info)); }
  if (data.section_2_presenting_concern !== undefined) { setClauses.push(`section_2_presenting_concern = $${idx++}`); values.push(data.section_2_presenting_concern ?? null); }
  if (data.section_3_key_points !== undefined) { setClauses.push(`section_3_key_points = $${idx++}`); values.push(JSON.stringify(data.section_3_key_points)); }
  if (data.section_4_observation !== undefined) { setClauses.push(`section_4_observation = $${idx++}`); values.push(data.section_4_observation ?? null); }
  if (data.section_5_intervention !== undefined) { setClauses.push(`section_5_intervention = $${idx++}`); values.push(JSON.stringify(data.section_5_intervention)); }
  if (data.section_6_employee_insight !== undefined) { setClauses.push(`section_6_employee_insight = $${idx++}`); values.push(data.section_6_employee_insight ?? null); }
  if (data.section_7_action_plan !== undefined) { setClauses.push(`section_7_action_plan = $${idx++}`); values.push(JSON.stringify(data.section_7_action_plan)); }
  if (data.section_8_risk !== undefined) { setClauses.push(`section_8_risk = $${idx++}`); values.push(JSON.stringify(data.section_8_risk)); }
  if (data.section_9_followup !== undefined) { setClauses.push(`section_9_followup = $${idx++}`); values.push(JSON.stringify(data.section_9_followup)); }
  if (data.section_10_closure !== undefined) { setClauses.push(`section_10_closure = $${idx++}`); values.push(data.section_10_closure ? JSON.stringify(data.section_10_closure) : null); }

  values.push(tenantId, sessionId);
  const { rows } = await queryWithTenant<EmployeeCounselingSessionRow>(
    tenantId,
    `UPDATE employee_counseling_sessions
     SET ${setClauses.join(', ')}
     WHERE tenant_id = $${idx++} AND session_id = $${idx++} AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  const updated = rows[0] ?? null;
  if (updated) {
    await auditLog({
      action: 'EMPLOYEE_COUNSELING_SESSION_UPDATED',
      entityType: 'employee_counseling_sessions',
      entityId: sessionId,
      after: updated as unknown as Record<string, unknown>,
      tenantId,
      actorId,
    });
  }
  return updated;
}

// ─── LIST SESSIONS ───────────────────────────────────────────────────────────

export async function listSessions(
  tenantId: string,
  submissionId: string,
): Promise<EmployeeCounselingSessionRow[]> {
  const { rows } = await queryWithTenant<EmployeeCounselingSessionRow>(
    tenantId,
    `SELECT * FROM employee_counseling_sessions
     WHERE tenant_id = $1 AND submission_id = $2 AND deleted_at IS NULL
     ORDER BY session_number ASC`,
    [tenantId, submissionId],
  );
  return rows;
}

// ─── CLOSE SUBMISSION ────────────────────────────────────────────────────────

export async function closeSubmission(
  tenantId: string,
  submissionId: string,
  input: CloseSubmissionInput,
  actorId: string,
): Promise<EmployeeCounselingSubmissionRow | null> {
  const { rows } = await queryWithTenant<EmployeeCounselingSubmissionRow>(
    tenantId,
    `UPDATE employee_counseling_submissions
     SET submission_status = 'closed', updated_at = now()
     WHERE tenant_id = $1 AND submission_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [tenantId, submissionId],
  );

  const updated = rows[0] ?? null;
  if (updated) {
    await auditLog({
      action: 'EMPLOYEE_COUNSELING_CLOSED',
      entityType: 'employee_counseling_submissions',
      entityId: submissionId,
      after: { closure_reason: input.closure.reason },
      tenantId,
      actorId,
    });
  }
  return updated;
}

// ─── ACCESS LOG ──────────────────────────────────────────────────────────────

export async function logAccess(
  tenantId: string,
  submissionId: string,
  userId: string,
  reason?: string,
): Promise<EmployeeCounselingAccessLogRow> {
  const { rows } = await queryWithTenant<EmployeeCounselingAccessLogRow>(
    tenantId,
    `INSERT INTO employee_counseling_access_log
       (tenant_id, submission_id, accessed_by, access_reason)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [tenantId, submissionId, userId, reason ?? null],
  );
  return rows[0]!;
}

export async function getAccessLog(
  tenantId: string,
  submissionId: string,
): Promise<EmployeeCounselingAccessLogWithUser[]> {
  const { rows } = await queryWithTenant<EmployeeCounselingAccessLogWithUser>(
    tenantId,
    `SELECT l.*, u.full_name AS accessed_by_name
     FROM employee_counseling_access_log l
     JOIN users u ON u.user_id = l.accessed_by
     WHERE l.tenant_id = $1 AND l.submission_id = $2
     ORDER BY l.accessed_at DESC`,
    [tenantId, submissionId],
  );
  return rows;
}
