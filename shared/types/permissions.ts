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
  | 'students';

export type Action = 'create' | 'read' | 'update' | 'delete';

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
    interventions: readOnly,
    media_assets: cr,
    alerts: none,
    reports: readOnly,
    consents: readOnly,
    audit_logs: none,
    positive_observations: cru,
    students: readOnly,
  },
  SUBSTITUTE_TEACHER: {
    cases: cr,
    incidents: cru,
    interventions: readOnly,
    media_assets: cr,
    alerts: none,
    reports: readOnly,
    consents: readOnly,
    audit_logs: none,
    positive_observations: cru,
    students: readOnly,
  },
  HOMEROOM_TEACHER: {
    cases: cr,
    incidents: cru,
    interventions: cru,
    media_assets: cr,
    alerts: readOnly,
    reports: readOnly,
    consents: readOnly,
    audit_logs: none,
    positive_observations: cru,
    students: readUpdate,
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
  },
  SCHOOL_NURSE: {
    cases: readOnly,        // medical-category only (enforced by ABAC)
    incidents: readOnly,    // medical-category only (enforced by ABAC)
    interventions: cru,     // medical interventions only
    media_assets: readOnly,
    alerts: none,
    reports: readOnly,
    consents: readOnly,
    audit_logs: none,
    positive_observations: readOnly,
    students: readOnly,
  },
  SCHOOL_HEAD: {
    cases: { create: true, read: true, update: true, delete: false }, // cannot delete
    incidents: readUpdate,
    interventions: readUpdate,
    media_assets: readOnly,
    alerts: readUpdate,
    reports: crud,
    consents: readOnly,
    audit_logs: readOnly,
    positive_observations: readOnly,
    students: readOnly,
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
  },
  CASE_REVIEWER: {
    cases: readOnly,        // assigned cases only (enforced by ABAC)
    incidents: readOnly,
    interventions: readOnly,
    media_assets: readOnly,
    alerts: none,
    reports: readOnly,
    consents: none,
    audit_logs: none,
    positive_observations: readOnly,
    students: readOnly,
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
  },
};
