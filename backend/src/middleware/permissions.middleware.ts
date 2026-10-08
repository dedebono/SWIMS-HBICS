import type { Request, Response, NextFunction } from 'express';
import { PERMISSIONS, type Resource, type Action } from '@swims/shared';
import type { Role } from '@swims/shared';
import { ForbiddenError } from '../utils/errors.js';
import { pool } from '../db/pool.js';
import { getTenantPermissionMatrix } from '../services/role-permissions.service.js';

/**
 * Middleware factory: checkPermission(resource, action)
 *
 * Enforces two layers:
 * 1. RBAC — the per-tenant dynamic matrix in `role_permissions` (edited from
 *    Admin → User Management → Role Permissions). Falls back to the static
 *    `PERMISSIONS` matrix when the tenant has no row for that role+resource,
 *    so a partially seeded tenant can never lock itself out.
 * 2. ABAC — applies contextual rules per role (teacher→class, nurse→medical, etc.)
 *
 * Call after authenticate and setTenantContext.
 */
export function checkPermission(resource: Resource, action: Action) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const role = req.userRole as Role;

      // ── Step 1: RBAC check ──────────────────────────────────────────────
      const rolePerms = PERMISSIONS[role];
      if (!rolePerms) {
        return next(new ForbiddenError(`Unknown role: ${role}`));
      }

      const resourcePerms = rolePerms[resource];
      if (!resourcePerms) {
        return next(new ForbiddenError(`No permissions defined for resource: ${resource}`));
      }

      // The dynamic matrix is the source of truth when the tenant actually has a
      // row for this role+resource+action — otherwise every toggle in the Role
      // Permissions UI would be silently ignored. `admin.manage` only ever exists
      // in the DB matrix, so it resolves through the same lookup.
      const dbAllowed = await lookupDynamicPermission(req.tenantId, role, resource, action);
      const allowed = dbAllowed ?? Boolean(resourcePerms[action]);

      if (!allowed) {
        return next(new ForbiddenError(
          `Role '${role}' is not allowed to '${action}' on '${resource}'`,
        ));
      }

      // ── Step 2: ABAC contextual checks ──────────────────────────────────
      await enforceAbac(req, role, resource, action);

      next();
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return next(err);
      }
      next(err);
    }
  };
}

/**
 * Read one permission from the tenant's dynamic matrix.
 * Returns undefined when the tenant has no stored decision for it, which tells
 * the caller to fall back to the static matrix. Never throws: a DB failure must
 * degrade to static permissions rather than lock everyone out.
 */
async function lookupDynamicPermission(
  tenantId: unknown,
  role: string,
  resource: string,
  action: string,
): Promise<boolean | undefined> {
  if (!tenantId) return undefined;
  try {
    const matrix = await getTenantPermissionMatrix(tenantId as string);
    const value = matrix[role]?.[resource]?.[action];
    return typeof value === 'boolean' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Enforce Attribute-Based Access Control rules per role.
 * Throws ForbiddenError if the ABAC constraint is violated.
 */
async function enforceAbac(
  req: Request,
  role: Role,
  resource: Resource,
  _action: Action,
): Promise<void> {
  const tenantId = req.tenantId;
  const userId = req.userId;

  switch (role) {
    case 'TEACHER': {
      // Teachers may only access records for students in their assigned class
      // Exception: incident/case creation for any student (incident reporting)
      const studentId = extractStudentId(req);
      if (studentId && resource !== 'students' && !((resource === 'incidents' || resource === 'cases') && _action === 'create')) {
        const allowed = await isStudentInTeacherClass(tenantId, userId, studentId);
        if (!allowed) {
          throw new ForbiddenError('You can only access records for students in your assigned class');
        }
      }
      break;
    }

    case 'COUNSELOR': {
      // Can access caseload + any CRITICAL risk student
      // This is a permissive check — counselors have broad access
      // The caseload check is applied when listing cases
      break;
    }

    case 'SCHOOL_NURSE': {
      // Can only access medical-category cases and incidents
      if (resource === 'cases' || resource === 'incidents') {
        // Mark on request so service layer can filter by MEDICAL category
        (req as unknown as Record<string, unknown>)['abacMedicalOnly'] = true;
      }
      break;
    }

    case 'SCHOOL_HEAD': {
      // Can read all within tenant, but cannot delete cases
      // (already handled by RBAC matrix where delete is false)
      break;
    }

    case 'BOARD_MEMBER': {
      // All data must be anonymized — mark on request
      (req as unknown as Record<string, unknown>)['abacAnonymize'] = true;
      break;
    }

    case 'IT_ADMIN': {
      // Blocked from reading case descriptions and incident narratives
      if (resource === 'cases' || resource === 'incidents') {
        (req as unknown as Record<string, unknown>)['abacRedactNarratives'] = true;
      }
      break;
    }
  }
}

/**
 * Extract student_id from request params/body/query.
 */
function extractStudentId(req: Request): string | undefined {
  return (
    (req.params['studentId'] as string | undefined) ??
    (req.body as Record<string, unknown> | undefined)?.['student_id'] as string | undefined ??
    (req.query['student_id'] as string | undefined)
  );
}

/**
 * Check if a student is in a class assigned to this teacher.
 */
async function isStudentInTeacherClass(
  tenantId: string,
  teacherUserId: string,
  studentId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM teacher_class_assignments tca
       JOIN student_enrollment_history seh
         ON seh.class_name = tca.class_name
         AND seh.academic_year = tca.academic_year
         AND seh.tenant_id = tca.tenant_id
       WHERE tca.tenant_id = $1
         AND tca.user_id = $2
         AND seh.student_id = $3
         AND seh.graduated_at IS NULL`,
      [tenantId, teacherUserId, studentId],
    );
    return Number(rows[0]?.count ?? 0) > 0;
  } finally {
    client.release();
  }
}
