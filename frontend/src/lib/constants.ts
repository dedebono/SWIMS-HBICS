// ─── Case status display constants ─────────────────────────────────────────────
export const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  HIGH: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  CRITICAL: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30 animate-pulse',
};

export const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-primary/15 text-primary border-primary/30',
  MONITORING: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  CLOSED: 'bg-muted text-muted-foreground border-border',
};

// ─── Classification display (DB stores LOW/MEDIUM/HIGH/CRITICAL) ───────────────
/** User-facing Classification scale. The incidents.severity and cases.risk_level
 *  columns keep their LOW/MEDIUM/HIGH/CRITICAL values (DB CHECK constraints),
 *  so every badge/filter must map through this table instead of rendering raw. */
export const CLASSIFICATION_LABELS: Record<string, string> = {
  LOW: 'Minor',
  MEDIUM: 'Moderate',
  HIGH: 'Major',
  CRITICAL: 'Severe',
};

/** Convenience: display label, falling back to the raw value for unknown input. */
export function classificationLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return CLASSIFICATION_LABELS[value] ?? value;
}

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

// ─── Initial assessment ("Penilaian Awal") labels ──────────────────────────────
/**
 * The four checkboxes on the Report Incident form, keyed by the boolean they
 * write into `incidents.metadata.initial_assessment`. Read back in Case Detail
 * and the Incidents list, so the label lives here once — those surfaces used to
 * disagree with the form (and each other). Do not quote a retired label in this
 * comment: source maps are baked into the build, so any example string here
 * shows up in a "is the old label gone?" grep as a false positive.
 */
export const ASSESSMENT_LABELS = {
  is_recurring: 'Kejadian berulang',
  similar_cases: 'Siswa pernah punya kasus serupa',
  needs_escalation: 'Perlu eskalasi',
  needs_parent_comm: 'Harus komunikasi dengan orang tua',
} as const;

export type AssessmentKey = keyof typeof ASSESSMENT_LABELS;

/** Ordered so every surface renders the same flags in the same order. */
export const ASSESSMENT_KEYS: AssessmentKey[] = [
  'is_recurring',
  'similar_cases',
  'needs_escalation',
  'needs_parent_comm',
];

/** The checked assessment keys of an incident, in display order. */
export function activeAssessmentKeys(
  assessment: Record<string, boolean> | undefined | null,
): AssessmentKey[] {
  if (!assessment) return [];
  return ASSESSMENT_KEYS.filter((key) => assessment[key] === true);
}

export const CASE_STATUSES = ['OPEN', 'MONITORING', 'CLOSED'] as const;
export type CaseStatus = typeof CASE_STATUSES[number];

export const COMMUNICATION_CHANNELS = ['PHONE', 'EMAIL', 'IN_PERSON', 'APP', 'INTERNAL'] as const;
export const CONTACT_ROLES = ['PARENT', 'GUARDIAN', 'TEACHER', 'INTERNAL'] as const;

// ─── Roles ────────────────────────────────────────────────────────────────────
//
// The frontend cannot import `@swims/shared` (no path alias, and the package's
// `main` points at a `dist/` the frontend image never builds), so this list is
// duplicated from `shared/types/database.ts` on purpose. Keep the two in sync —
// `backend/src/api/__tests__/roles.test.ts` asserts the backend's `ROLE_NAMES`,
// the permission matrix, and the `users_role_check` constraint all agree.

/** Login roles — these are the values `users.role` may hold. */
export const LOGIN_ROLES = [
  'TEACHER',
  'COUNSELOR',
  'SCHOOL_NURSE',
  'SCHOOL_HEAD',
  'BOARD_MEMBER',
  'IT_ADMIN',
  'PERSONAL',
  'PSYCHOLOGIST',
] as const;
export type LoginRole = typeof LOGIN_ROLES[number];

/**
 * Roles offered in the admin account form. `STUDENT` is a record in the
 * `students` table (incident subjects) rather than a login account: it has no
 * email/password, cannot authenticate, and has no permission matrix.
 */
export const ACCOUNT_ROLES = [...LOGIN_ROLES, 'STUDENT'] as const;
export type AccountRole = typeof ACCOUNT_ROLES[number];

export const ROLE_LABELS: Record<AccountRole, string> = {
  TEACHER: 'Teacher',
  COUNSELOR: 'Counselor',
  SCHOOL_NURSE: 'School Nurse',
  SCHOOL_HEAD: 'School Head',
  BOARD_MEMBER: 'Board Member',
  IT_ADMIN: 'IT Admin',
  PERSONAL: 'Personal',
  PSYCHOLOGIST: 'Psychologist',
  STUDENT: 'Student',
};

/** Roles a staff account can be assigned to — excludes STUDENT (different table). */
export const ASSIGNABLE_ROLES = LOGIN_ROLES;
