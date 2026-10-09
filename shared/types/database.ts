// ─── Enums as const objects (for runtime + type use) ────────────────────────

export const SchoolLevel = {
  PRESCHOOL: 'PRESCHOOL',
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  SENIOR_HIGH: 'SENIOR_HIGH',
} as const;
export type SchoolLevel = (typeof SchoolLevel)[keyof typeof SchoolLevel];

export const CaseType = {
  BEHAVIORAL: 'BEHAVIORAL',
  EMOTIONAL: 'EMOTIONAL',
  MEDICAL: 'MEDICAL',
  ACADEMIC: 'ACADEMIC',
  POSITIVE: 'POSITIVE',
} as const;
export type CaseType = (typeof CaseType)[keyof typeof CaseType];

export const CaseStatus = {
  OPEN: 'OPEN',
  MONITORING: 'MONITORING',
  CLOSED: 'CLOSED',
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const RiskLevelSource = {
  MANUAL: 'MANUAL',
  AUTO: 'AUTO',
} as const;
export type RiskLevelSource = (typeof RiskLevelSource)[keyof typeof RiskLevelSource];

export const Severity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

/**
 * Account roles — these are the only values `users.role` may hold (mirrored by
 * the `users_role_check` CHECK constraint, see migration 047).
 *
 * `STUDENT` is intentionally absent: students are records in the `students`
 * table (incident subjects), not login accounts. They carry no email or
 * password_hash, cannot authenticate, and have no permission matrix. Use
 * `PERSONAL` for an individual with a self-service login.
 */
export const Role = {
  TEACHER: 'TEACHER',
  COUNSELOR: 'COUNSELOR',
  SCHOOL_NURSE: 'SCHOOL_NURSE',
  SCHOOL_HEAD: 'SCHOOL_HEAD',
  BOARD_MEMBER: 'BOARD_MEMBER',
  IT_ADMIN: 'IT_ADMIN',
  PERSONAL: 'PERSONAL',
  PSYCHOLOGIST: 'PSYCHOLOGIST',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/**
 * Runtime name lists — the single source of truth for role pickers and request
 * validation, kept next to the `Role` union so they cannot drift.
 *
 * `ACCOUNT_ROLE_NAMES` additionally includes `'STUDENT'` because that is a
 * valid choice in the admin "create account" form: it routes to the `students`
 * table rather than `users`. `getAccountRoleTarget()` returns which table a
 * role lands in.
 */
export const ROLE_NAMES = [
  'TEACHER',
  'COUNSELOR',
  'SCHOOL_NURSE',
  'SCHOOL_HEAD',
  'BOARD_MEMBER',
  'IT_ADMIN',
  'PERSONAL',
  'PSYCHOLOGIST',
] as const;

export const STUDENT = 'STUDENT' as const;
export type AccountRole = (typeof ROLE_NAMES)[number] | typeof STUDENT;
export const ACCOUNT_ROLE_NAMES: readonly AccountRole[] = [...ROLE_NAMES, STUDENT];

/** `'students'` when the role is STUDENT, `'users'` for every login role. */
export function getAccountRoleTarget(role: string): 'users' | 'students' {
  return role === STUDENT ? 'students' : 'users';
}

export const AlertStatus = {
  PENDING: 'PENDING',
  REVIEWED: 'REVIEWED',
  DISMISSED: 'DISMISSED',
  ESCALATED: 'ESCALATED',
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export const ConsentGivenBy = {
  PARENT: 'PARENT',
  GUARDIAN: 'GUARDIAN',
  STUDENT: 'STUDENT',
} as const;
export type ConsentGivenBy = (typeof ConsentGivenBy)[keyof typeof ConsentGivenBy];

export const RedactionStatus = {
  NONE: 'NONE',
  PENDING: 'PENDING',
  REDACTED: 'REDACTED',
} as const;
export type RedactionStatus = (typeof RedactionStatus)[keyof typeof RedactionStatus];

// ─── Database Row Types ─────────────────────────────────────────────────────

export interface TenantRow {
  tenant_id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
}

export interface UserRow {
  user_id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  national_id: string | null;
  national_id_hash: string | null;
  /** Storage key of the profile photo inside /app/media; null when unset. */
  avatar_key: string | null;
  /** Last avatar upload — used as the HTTP cache-buster. */
  avatar_updated_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface StudentRow {
  student_id: string;
  tenant_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  national_id: string | null;
  qr_code: string | null;
  parent_email: string | null;
  phone_number: string | null;
  /** Storage key of the profile photo inside /app/media; null when unset. */
  avatar_key: string | null;
  /** Last avatar upload — used as the HTTP cache-buster. */
  avatar_updated_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
}

export interface StaffQuisionerSubmissionRow {
  submission_id: string;
  tenant_id: string;
  staff_user_id: string;
  total_score: number;
  recommendation: 'professional' | 'internal';
  answers: unknown;
  status: 'new' | 'reviewed' | 'scheduled' | 'closed';
  counselor_notes: string | null;
  question_list_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface StaffQuisionerSubmissionWithStaff extends StaffQuisionerSubmissionRow {
  staff_name: string;
  staff_gender: string;
  staff_email: string | null;
}

export interface StudentEnrollmentHistoryRow {
  enrollment_id: string;
  student_id: string;
  tenant_id: string;
  school_level: SchoolLevel;
  school_phase: string | null;
  class_name: string | null;
  academic_year: string;
  enrolled_at: string;
  graduated_at: string | null;
  transfer_note: string | null;
}

export interface CaseRow {
  case_id: string;
  tenant_id: string;
  student_id: string;
  case_type: CaseType;
  status: CaseStatus;
  risk_level: RiskLevel;
  risk_level_source: RiskLevelSource;
  assigned_counselor: string | null;
  school_phase_ref: string | null;
  opened_date: string;
  closed_date: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  is_sensitive: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface IncidentRow {
  incident_id: string;
  tenant_id: string;
  case_id: string;
  student_id: string;
  category: string;
  sub_category: string | null;
  severity: Severity;
  description: string;
  location: string | null;
  student_grade: string | null;
  incident_at: string;
  reported_by: string;
  involved_teacher: string | null;
  witnesses: Array<{ user_id?: string; name: string; statement?: string }>;
  immediate_actions: string | null;
  language_flag: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InterventionRow {
  intervention_id: string;
  tenant_id: string;
  case_id: string;
  incident_id: string | null;
  assigned_staff: string[];
  type: string;
  description: string;
  scheduled_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  effectiveness: number | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MediaAssetRow {
  asset_id: string;
  tenant_id: string;
  incident_id: string | null;
  case_id: string | null;
  uploader_id: string;
  file_name: string;
  file_hash: string;
  mime_type: string;
  storage_key: string;
  redaction_status: RedactionStatus;
  redacted_key: string | null;
  retention_expiry: string | null;
  access_logs: Array<Record<string, unknown>>;
  version: number;
  created_at: string;
  deleted_at: string | null;
}

export interface ConsentRow {
  consent_id: string;
  tenant_id: string;
  student_id: string;
  given_by: ConsentGivenBy;
  given_by_user_id: string | null;
  consent_type: string;
  version: string;
  granted: boolean;
  granted_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AlertRow {
  alert_id: string;
  tenant_id: string;
  student_id: string;
  triggered_by: string;
  pattern_data: Record<string, unknown>;
  severity: Severity;
  status: AlertStatus;
  assigned_to: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  dismissal_reason: string | null;
  expires_at: string;
  created_at: string;
}

export interface AuditLogRow {
  log_id: string;
  tenant_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface PositiveObservationRow {
  observation_id: string;
  tenant_id: string;
  student_id: string;
  case_id: string | null;
  recorded_by: string;
  category: string;
  description: string;
  observed_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
}

export interface CaseCommunicationRow {
  comm_id: string;
  tenant_id: string;
  case_id: string;
  author_id: string;
  message: string;
  channel: string;
  contact_name: string;
  contact_role: string;
  metadata: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
}

export interface ColdArchiveRow {
  archive_id: string;
  tenant_id: string;
  original_case_id: string;
  student_id: string;
  archived_data: Record<string, unknown>;
  archived_at: string;
  deleted_at: string | null;
}

export interface ReportRow {
  report_id: string;
  tenant_id: string;
  requested_by: string;
  report_type: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  parameters: Record<string, unknown>;
  storage_key: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface HomeroomAssignmentRow {
  assignment_id: string;
  tenant_id: string;
  teacher_id: string;
  class_name: string;
  academic_year: string;
  created_at: string;
  updated_at: string;
}

export interface QuisionerQuestionRow {
  question_id: string;
  tenant_id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'checkbox' | 'text' | 'rating';
  is_required: boolean;
  order_index: number;
  question_list_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface QuisionerAnswerRow {
  answer_id: string;
  question_id: string;
  answer_text: string;
  score: number;
  created_at: string;
  deleted_at: string | null;
}

export interface QuestionListRow {
  question_list_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  targets: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AppointmentRow {
  appointment_id: string;
  tenant_id: string;
  type: 'student' | 'personal';
  status: 'pending' | 'awaiting_parent_choice' | 'awaiting_psychologist_availability' | 'confirmed' | 'cancelled' | 'completed';
  scheduled_at: string | null;
  location: 'online' | 'offline' | null;
  notes: string | null;
  created_by: string;
  created_for: string;
  student_id: string | null;
  counselor_id: string | null;
  psychologist_id: string | null;
  school_nurse_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type RepeatPattern = 'weekly' | 'biweekly' | 'monthly';

export interface AvailabilitySlotRow {
  slot_id: string;
  tenant_id: string;
  professional_id: string;
  slot_start: string;
  slot_end: string;
  is_available: boolean;
  appointment_id: string | null;
  repeat_pattern: RepeatPattern | null;
  repeat_day: number | null;       // 0=Sun .. 6=Sat
  repeat_time: string | null;      // HH:MM
  parent_slot_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ParentReferralTokenRow {
  token_id: string;
  tenant_id: string;
  appointment_id: string | null;
  student_id: string;
  parent_phone: string;
  parent_name: string | null;
  token: string;
  token_expires_at: string;
  choice_status: 'pending' | 'school_psychologist' | 'private_psychologist' |
                 'psychologist_selected' | 'payment_pending' |
                 'payment_confirmed' | 'schedule_confirmed' | 'expired';
  selected_psychologist_id: string | null;
  payment_amount: number | null;
  payment_confirmed_at: string | null;
  payment_notes: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolPsychologistRow {
  psychologist_id: string;
  tenant_id: string;
  /** Login account this profile belongs to (migration 048). */
  user_id?: string | null;
  full_name: string;
  expertise: string;
  photo_url: string | null;
  consultation_fee: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Only present on the admin list endpoint. */
  email?: string | null;
  has_profile?: boolean;
}
