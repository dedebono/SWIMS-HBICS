import { getClientWithTenant, queryWithTenant } from '../db/pool.js';

export interface SwimsExport {
  version: number;
  exportedAt: string;
  sourceTenantId: string;
  data: Record<string, Record<string, unknown>[]>;
}

const EXPORT_VERSION = 2;

// Whitelisted columns per table — only these are ever inserted from an export file.
const TABLE_COLUMNS: Record<string, string[]> = {
  // ── Core identity ──────────────────────────────────────────────
  students: [
    'student_id', 'tenant_id', 'full_name', 'date_of_birth', 'gender',
    'national_id', 'qr_code', 'metadata', 'created_at', 'deleted_at',
  ],
  users: [
    'user_id', 'tenant_id', 'full_name', 'email', 'password_hash', 'role',
    'is_active', 'created_at', 'deleted_at', 'national_id_hash',
  ],
  // ── Case management ────────────────────────────────────────────
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
  // ── Consents & alerts ─────────────────────────────────────────
  consents: [
    'consent_id', 'tenant_id', 'student_id', 'given_by', 'given_by_user_id',
    'consent_type', 'version', 'granted', 'granted_at', 'expires_at',
    'revoked_at', 'revocation_reason', 'metadata', 'created_at',
  ],
  alerts: [
    'alert_id', 'tenant_id', 'student_id', 'triggered_by', 'pattern_data',
    'severity', 'status', 'assigned_to', 'reviewed_by', 'reviewed_at',
    'dismissal_reason', 'expires_at', 'created_at',
  ],
  // ── Appointments & availability ────────────────────────────────
  appointments: [
    'appointment_id', 'tenant_id', 'type', 'status', 'scheduled_at',
    'location', 'notes', 'created_by', 'created_for', 'student_id',
    'counselor_id', 'psychologist_id',
  ],
  availability_slots: [
    'slot_id', 'tenant_id', 'professional_id', 'slot_start', 'slot_end',
    'is_available', 'appointment_id', 'created_at', 'updated_at', 'deleted_at',
    'repeat_pattern', 'repeat_day',
  ],
  // ── Media ─────────────────────────────────────────────────────
  media_assets: [
    'asset_id', 'tenant_id', 'incident_id', 'case_id', 'uploader_id',
    'file_name', 'file_hash', 'mime_type', 'storage_key', 'redaction_status',
    'redacted_key', 'retention_expiry',
  ],
  // ── Counseling ────────────────────────────────────────────────
  counseling_submissions: [
    'submission_id', 'tenant_id', 'case_id', 'submitted_by', 'student_id',
    'recommendation', 'score', 'submitted_at', 'deleted_at',
  ],
  // ── Employee counseling ────────────────────────────────────────
  employee_counseling_submissions: [
    'submission_id', 'tenant_id', 'employee_name', 'unit', 'position',
    'contact_number', 'answers', 'consents', 'is_high_priority',
    'submission_status', 'submitted_by', 'assigned_counselor_id',
    'submitted_at', 'updated_at', 'deleted_at',
  ],
  employee_counseling_sessions: [
    'session_id', 'tenant_id', 'submission_id', 'session_number', 'session_date',
    'session_time', 'method', 'section_1_info', 'section_2_presenting_concern',
    'section_3_key_points', 'section_4_observation', 'section_5_intervention',
    'section_6_follow_up', 'section_7_outcome', 'section_8_notes',
    'section_9_attachments', 'section_10_additional', 'created_at', 'updated_at',
  ],
  employee_counseling_access_log: [
    'log_id', 'tenant_id', 'submission_id', 'accessed_by', 'accessed_at',
  ],
  // ── Quisioner ──────────────────────────────────────────────────
  quisioner_question_lists: [
    'question_list_id', 'tenant_id', 'name', 'description', 'targets',
    'is_active', 'created_at', 'updated_at', 'deleted_at',
  ],
  quisioner_questions: [
    'question_id', 'tenant_id', 'question_text', 'question_type', 'is_required',
    'order_index', 'created_at', 'updated_at', 'deleted_at', 'question_list_id',
  ],
  quisioner_answers: [
    'answer_id', 'question_id', 'answer_text', 'score', 'created_at', 'deleted_at',
  ],
  staff_quisioner_submissions: [
    'submission_id', 'tenant_id', 'staff_user_id', 'total_score', 'recommendation',
    'answers', 'status', 'counselor_notes', 'created_at', 'updated_at',
    'deleted_at', 'question_list_id',
  ],
  // ── Psychologist referrals ─────────────────────────────────────
  psychologist_referrals: [
    'referral_id', 'tenant_id', 'appointment_id', 'recommended_by', 'reason',
    'referral_type', 'status', 'leader_id', 'leader_decision_at', 'leader_note',
    'external_result_note', 'external_recorded_by', 'external_recorded_at',
    'created_at', 'updated_at', 'deleted_at',
  ],
  school_psychologists: [
    'psychologist_id', 'tenant_id', 'name', 'institution', 'contact_number',
    'email', 'specialization', 'is_active', 'created_at', 'updated_at',
  ],
  // ── Discipline handbook ───────────────────────────────────────
  discipline_categories: [
    'id', 'name', 'general_description', 'characteristics',
    'impact_victim', 'impact_perpetrator', 'impact_school', 'created_at', 'updated_at',
  ],
  discipline_education_levels: [
    'id', 'code', 'name', 'sort_order', 'created_at',
  ],
  discipline_behavior_groups: [
    'id', 'category_id', 'group_name', 'description', 'created_at', 'updated_at',
  ],
  discipline_behavior_details: [
    'id', 'group_id', 'behavior_text', 'created_at', 'updated_at',
  ],
  discipline_behavior_levels: [
    'behavior_id', 'level_id',
  ],
  discipline_handling_guidelines: [
    'id', 'category_id', 'level_id', 'target_type', 'step_number',
    'guideline_text', 'created_at', 'updated_at',
  ],
  discipline_consequence_guidelines: [
    'id', 'category_id', 'level_id', 'consequence_type', 'consequence_text',
    'created_at', 'updated_at',
  ],
  discipline_required_documents: [
    'id', 'category_id', 'level_id', 'document_name', 'template_url',
    'description', 'created_at', 'updated_at',
  ],
  // ── RBAC ──────────────────────────────────────────────────────
  role_permissions: [
    'tenant_id', 'role', 'resource', 'action', 'allowed', 'created_at', 'updated_at',
  ],
};

// Insertion order respects foreign-key dependencies.
const TABLE_ORDER = [
  // 1. Identity
  'students',
  'users',
  // 2. RBAC (depends on users via role)
  'role_permissions',
  // 3. Cases (depends on students, users)
  'cases',
  // 4. Case children
  'incidents',
  'interventions',
  'positive_observations',
  'case_shares',
  'counseling_submissions',
  // 5. Appointments (standalone FK to users)
  'appointments',
  'availability_slots',
  // 6. Alerts & consents
  'alerts',
  'consents',
  // 7. Media (depends on incidents, cases, users)
  'media_assets',
  // 8. Employee counseling
  'employee_counseling_submissions',
  'employee_counseling_sessions',
  'employee_counseling_access_log',
  // 9. Quisioner (depends on itself via question_list_id)
  'quisioner_question_lists',
  'quisioner_questions',
  'quisioner_answers',
  'staff_quisioner_submissions',
  // 10. Psychologist
  'psychologist_referrals',
  'school_psychologists',
  // 11. Discipline handbook (all integers, no FK between them except group->cat, detail->group)
  'discipline_categories',
  'discipline_education_levels',
  'discipline_behavior_groups',
  'discipline_behavior_details',
  'discipline_behavior_levels',
  'discipline_handling_guidelines',
  'discipline_consequence_guidelines',
  'discipline_required_documents',
] as const;

/**
 * Export all users, all students, and every case (active + closed) together
 * with all related data (incidents, interventions, observations, shares, etc.)
 * Media asset files are NOT included — only the metadata rows.
 */
export async function exportData(tenantId: string): Promise<SwimsExport> {
  const [students, users, allCases, rolePerms, consents, alerts,
    appointments, availability, media,
    counseling, empCounseling, empSessions, empAccess,
    qLists, qQuestions, qAnswers, staffQ,
    psychRefs, psychologists,
    discCats, discLevels, discGroups, discDetails, discBehLevels,
    discGuidelines, discCons, discDocs] = await Promise.all([
    queryWithTenant(tenantId, `SELECT * FROM students WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM users WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM cases WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM role_permissions WHERE tenant_id = $1`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM consents WHERE tenant_id = $1`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM alerts WHERE tenant_id = $1`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM appointments WHERE tenant_id = $1`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM availability_slots WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM media_assets WHERE tenant_id = $1`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM counseling_submissions WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM employee_counseling_submissions WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM employee_counseling_sessions WHERE tenant_id = $1`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM employee_counseling_access_log WHERE tenant_id = $1`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM quisioner_question_lists WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM quisioner_questions WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM quisioner_answers WHERE deleted_at IS NULL`, []),
    queryWithTenant(tenantId, `SELECT * FROM staff_quisioner_submissions WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM psychologist_referrals WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM school_psychologists WHERE tenant_id = $1`, [tenantId]),
    queryWithTenant(tenantId, `SELECT * FROM discipline_categories`, []),
    queryWithTenant(tenantId, `SELECT * FROM discipline_education_levels`, []),
    queryWithTenant(tenantId, `SELECT * FROM discipline_behavior_groups`, []),
    queryWithTenant(tenantId, `SELECT * FROM discipline_behavior_details`, []),
    queryWithTenant(tenantId, `SELECT * FROM discipline_behavior_levels`, []),
    queryWithTenant(tenantId, `SELECT * FROM discipline_handling_guidelines`, []),
    queryWithTenant(tenantId, `SELECT * FROM discipline_consequence_guidelines`, []),
    queryWithTenant(tenantId, `SELECT * FROM discipline_required_documents`, []),
  ]);

  const allCaseIds = allCases.rows.map((c: any) => c.case_id);

  // Fetch case-bound data in parallel
  const [incidents, interventions, posObs, caseShares] = await Promise.all([
    allCaseIds.length
      ? queryWithTenant(tenantId, `SELECT * FROM incidents WHERE tenant_id = $1 AND deleted_at IS NULL AND case_id = ANY($2)`, [tenantId, allCaseIds])
      : Promise.resolve({ rows: [] }),
    allCaseIds.length
      ? queryWithTenant(tenantId, `SELECT * FROM interventions WHERE tenant_id = $1 AND deleted_at IS NULL AND case_id = ANY($2)`, [tenantId, allCaseIds])
      : Promise.resolve({ rows: [] }),
    allCaseIds.length
      ? queryWithTenant(tenantId, `SELECT * FROM positive_observations WHERE tenant_id = $1 AND deleted_at IS NULL AND case_id = ANY($2)`, [tenantId, allCaseIds])
      : Promise.resolve({ rows: [] }),
    allCaseIds.length
      ? queryWithTenant(tenantId, `SELECT * FROM case_shares WHERE tenant_id = $1 AND case_id = ANY($2)`, [tenantId, allCaseIds])
      : Promise.resolve({ rows: [] }),
  ]);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceTenantId: tenantId,
    data: {
      students: students.rows,
      users: users.rows,
      cases: allCases.rows,
      incidents: incidents.rows,
      interventions: interventions.rows,
      positive_observations: posObs.rows,
      case_shares: caseShares.rows,
      consents: consents.rows,
      alerts: alerts.rows,
      appointments: appointments.rows,
      availability_slots: availability.rows,
      media_assets: media.rows,
      counseling_submissions: counseling.rows,
      employee_counseling_submissions: empCounseling.rows,
      employee_counseling_sessions: empSessions.rows,
      employee_counseling_access_log: empAccess.rows,
      quisioner_question_lists: qLists.rows,
      quisioner_questions: qQuestions.rows,
      quisioner_answers: qAnswers.rows,
      staff_quisioner_submissions: staffQ.rows,
      psychologist_referrals: psychRefs.rows,
      school_psychologists: psychologists.rows,
      discipline_categories: discCats.rows,
      discipline_education_levels: discLevels.rows,
      discipline_behavior_groups: discGroups.rows,
      discipline_behavior_details: discDetails.rows,
      discipline_behavior_levels: discBehLevels.rows,
      discipline_handling_guidelines: discGuidelines.rows,
      discipline_consequence_guidelines: discCons.rows,
      discipline_required_documents: discDocs.rows,
      role_permissions: rolePerms.rows,
    },
  };
}

export interface ImportResult {
  imported: Record<string, number>;
  version: number;
}

/**
 * Import a previously exported dataset into the current tenant.
 * All rows keep their original UUIDs so internal relationships survive,
 * but tenant_id is re-written to the current tenant.
 * Existing rows (by primary key) are skipped — making import idempotent.
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
      if (!cols) {
        imported[table] = 0;
        continue;
      }

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

      const pkCol = cols[0];
      const sql =
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${placeholders.join(', ')} ` +
        `ON CONFLICT (${pkCol}) DO NOTHING`;
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
