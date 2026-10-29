import { queryWithTenant } from '../db/pool.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * Case visibility scoping (ABAC).
 *
 * The tenant RBAC matrix decides WHO may call the cases/incidents endpoints.
 * This module decides WHICH cases a role may actually see once RBAC lets the
 * request through.
 *
 * TEACHER / SUBSTITUTE_TEACHER are scoped: a teacher only sees
 *   1. cases they created (`cases.created_by`),
 *   2. cases with an incident they reported (`incidents.reported_by`),
 *   3. cases explicitly shared with them (`case_shares.shared_with`).
 * The "Kasus Siswa" page already promises exactly this in its copy:
 * "Menampilkan kasus dari laporan Anda dan kasus yang dibagikan kepada Anda."
 *
 * Without this scope every teacher could list/read/modify every case in the
 * tenant — including cases reported by other accounts about students outside
 * their class (the "case leaks to another account" bug, 2026-10-26).
 *
 * All other roles with `cases:read` (SCHOOL_HEAD, COUNSELOR, PSYCHOLOGIST,
 * BOARD_MEMBER, SCHOOL_NURSE, IT_ADMIN) keep tenant-wide read as before; their
 * own ABAC restrictions (nurse→medical, board→anonymized, admin→redacted)
 * continue to be applied elsewhere.
 */

const TEACHER_SCOPED_ROLES = new Set(['TEACHER', 'SUBSTITUTE_TEACHER']);

export interface CaseViewer {
  userId: string;
  role: string;
}

export function isTeacherScoped(viewer: CaseViewer): boolean {
  return TEACHER_SCOPED_ROLES.has(viewer.role);
}

/**
 * SQL predicate restricting case rows to what a teacher may see.
 *
 * @param alias SQL alias of the `cases` table (must expose case_id, tenant_id, created_by)
 * @param userParam literal parameter placeholder holding the viewer's user_id, e.g. `$3`
 */
export function caseVisibilityPredicate(alias: string, userParam: string): string {
  return `(
    ${alias}.created_by = ${userParam}
    OR EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.case_id = ${alias}.case_id
        AND i.tenant_id = ${alias}.tenant_id
        AND i.reported_by = ${userParam}
        AND i.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM case_shares cs
      WHERE cs.case_id = ${alias}.case_id
        AND cs.tenant_id = ${alias}.tenant_id
        AND cs.shared_with = ${userParam}
    )
  )`;
}

/**
 * Throws NotFoundError when a teacher-scoped viewer may not see the case.
 * (404 instead of 403 so the endpoint does not confirm the case's existence
 * to accounts it is hidden from.) Non-teacher roles pass through.
 */
export async function assertCaseVisible(
  tenantId: string,
  caseId: string,
  viewer: CaseViewer,
): Promise<void> {
  if (!isTeacherScoped(viewer)) return;
  const { rows } = await queryWithTenant<{ visible: boolean }>(
    tenantId,
    `SELECT EXISTS (
       SELECT 1 FROM cases c
       WHERE c.case_id = $1
         AND c.tenant_id = $2
         AND c.deleted_at IS NULL
         AND ${caseVisibilityPredicate('c', '$3')}
     ) AS visible`,
    [caseId, tenantId, viewer.userId],
  );
  if (!rows[0]?.visible) {
    throw new NotFoundError('Case', caseId);
  }
}

/**
 * Same rule for a single incident: visible when the viewer reported it, or
 * when its parent case is visible. Throws NotFoundError otherwise.
 */
export async function assertIncidentVisible(
  tenantId: string,
  incidentId: string,
  viewer: CaseViewer,
): Promise<void> {
  if (!isTeacherScoped(viewer)) return;
  const { rows } = await queryWithTenant<{ visible: boolean }>(
    tenantId,
    `SELECT EXISTS (
       SELECT 1 FROM incidents i
       JOIN cases c ON c.case_id = i.case_id AND c.tenant_id = i.tenant_id
       WHERE i.incident_id = $1
         AND i.tenant_id = $2
         AND i.deleted_at IS NULL
         AND (i.reported_by = $3 OR ${caseVisibilityPredicate('c', '$3')})
     ) AS visible`,
    [incidentId, tenantId, viewer.userId],
  );
  if (!rows[0]?.visible) {
    throw new NotFoundError('Incident', incidentId);
  }
}
