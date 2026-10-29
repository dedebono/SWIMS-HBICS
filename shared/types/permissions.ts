import type { Role } from './database.js';

// ─── CRUD Flags ──────────────────────────────────────────────────────────────

export interface CrudFlags {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

// ─── Resource Names ──────────────────────────────────────────────────────────

export type Resource =
  | 'cases'
  | 'incidents'
  | 'interventions'
  | 'media_assets'
  | 'alerts'
  | 'reports'
  | 'consents'
  | 'audit_logs'
  | 'positive_observations'
  | 'students'
  | 'admin'
  | 'quisioner'
  | 'appointments'
  | 'availability'
  | 'staff_quisioner'
  | 'employee_counseling';

export type Action = 'create' | 'read' | 'update' | 'delete';

/**
 * Runtime name lists — the single source of truth for validating permission
 * payloads. Kept alongside the `Resource`/`Action` unions above so request
 * validation (zod enums) and the TS types cannot drift apart.
 *
 * `manage` is deliberately included: it is not part of the CRUD `Action`
 * union, but `admin.manage` is what gates RBAC administration at runtime and
 * role_permissions stores those rows.
 */
export const RESOURCE_NAMES = [
  'cases',
  'incidents',
  'interventions',
  'media_assets',
  'alerts',
  'reports',
  'consents',
  'audit_logs',
  'positive_observations',
  'students',
  'admin',
  'quisioner',
  'appointments',
  'availability',
  'staff_quisioner',
  'employee_counseling',
] as const;

export const ACTION_NAMES = ['create', 'read', 'update', 'delete', 'manage'] as const;

// ─── Permission Matrix Type ──────────────────────────────────────────────────

export type PermissionMatrix = Record<Role, Record<Resource, CrudFlags>>;

// ─── The actual RBAC permissions matrix ──────────────────────────────────────

const none: CrudFlags = { create: false, read: false, update: false, delete: false };
const readOnly: CrudFlags = { create: false, read: true, update: false, delete: false };
const readUpdate: CrudFlags = { create: false, read: true, update: true, delete: false };
const crud: CrudFlags = { create: true, read: true, update: true, delete: true };
const cru: CrudFlags = { create: true, read: true, update: true, delete: false };
const cr: CrudFlags = { create: true, read: true, update: false, delete: false };

export const PERMISSIONS: PermissionMatrix = {
  TEACHER: {
    cases: cr,
    incidents: cru,
    interventions: cru,
    media_assets: cru,
    alerts: none,
    reports: readOnly,
    consents: readOnly,
    audit_logs: none,
    positive_observations: cru,
    students: readOnly,
    admin: none,
    quisioner: cr,
    // Read-only: the teacher form lists the student's appointments ("Janji Temu
    // Terkait" in counseling-tab.tsx) after submitting the questionnaire. The
    // appointment row itself is created server-side by submitCaseCounseling, so
    // the teacher never needs create/update/delete here.
    appointments: readOnly,
    availability: none,
    staff_quisioner: none,
    employee_counseling: cr,
  },
  COUNSELOR: {
    cases: crud,
    incidents: crud,
    interventions: crud,
    media_assets: crud,
    alerts: readUpdate,
    reports: cru,
    consents: cru,
    audit_logs: readOnly,
    positive_observations: crud,
    students: readUpdate,
    admin: none,
    quisioner: readOnly,
    appointments: crud,
    availability: crud,
    staff_quisioner: readUpdate,
    employee_counseling: crud,
  },
  SCHOOL_NURSE: {
    cases: readOnly,        // medical-category only (enforced by ABAC)
    incidents: readOnly,    // medical-category only (enforced by ABAC)
    interventions: cru,     // medical interventions only
    media_assets: cru,
    alerts: none,
    reports: readOnly,
    consents: readOnly,
    audit_logs: none,
    positive_observations: readOnly,
    students: readOnly,
    admin: none,
    quisioner: readOnly,
    appointments: readUpdate,
    availability: readOnly,
    staff_quisioner: none,
    employee_counseling: cr,
  },
  SCHOOL_HEAD: {
    cases: { create: true, read: true, update: true, delete: false }, // cannot delete
    incidents: readUpdate,
    interventions: readUpdate,
    media_assets: cru,
    alerts: readUpdate,
    reports: crud,
    consents: readOnly,
    audit_logs: readOnly,
    positive_observations: readOnly,
    students: readOnly,
    admin: none,
    quisioner: readOnly,
    appointments: readUpdate,
    availability: readOnly,
    staff_quisioner: none,
    employee_counseling: readOnly,
  },
  BOARD_MEMBER: {
    cases: readOnly,        // anonymized only (enforced by ABAC)
    incidents: readOnly,    // anonymized only
    interventions: readOnly,
    media_assets: none,
    alerts: none,
    reports: readOnly,      // aggregate reports only
    consents: none,
    audit_logs: none,
    positive_observations: readOnly,
    students: none,         // no PII access
    admin: none,
    quisioner: none,
    appointments: none,
    availability: none,
    staff_quisioner: none,
    employee_counseling: none,
  },
  IT_ADMIN: {
    cases: readOnly,        // no descriptions (enforced by ABAC — data minimization)
    incidents: readOnly,    // no narratives (enforced by ABAC)
    interventions: readOnly,
    media_assets: crud,
    alerts: readOnly,
    reports: readOnly,
    consents: crud,
    audit_logs: readOnly,
    positive_observations: readOnly,
    students: crud,
    admin: crud,
    quisioner: crud,
    appointments: crud,
    availability: crud,
    staff_quisioner: crud,
    employee_counseling: crud,
  },
  PERSONAL: {
    cases: none,            // personal account — no case access
    incidents: none,
    interventions: none,
    media_assets: none,
    alerts: none,
    reports: none,
    consents: none,
    audit_logs: none,
    positive_observations: none,
    students: none,
    admin: none,
    quisioner: none,
    appointments: cr,
    availability: readOnly,
    staff_quisioner: none,
    employee_counseling: cr,
  },
  PSYCHOLOGIST: {
    cases: none,
    incidents: none,
    interventions: none,
    media_assets: none,
    alerts: none,
    reports: none,
    consents: none,
    audit_logs: none,
    positive_observations: none,
    students: none,
    admin: none,
    quisioner: readOnly,
    appointments: crud,
    availability: crud,
    staff_quisioner: readUpdate,
    employee_counseling: crud,
  },
};
