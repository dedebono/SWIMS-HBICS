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
 * 1. RBAC — checks the static permissions matrix
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

      if (!resourcePerms[action]) {
        // The 'manage' action is not in the static CRUD matrix — check DB dynamic permissions
        if (action === 'manage' && req.tenantId) {
          const matrix = await getTenantPermissionMatrix(req.tenantId as string);
          const roleDbPerms = matrix[role as string];
          const resourceDbPerms = roleDbPerms?.[resource as string];
          if (!resourceDbPerms?.manage) {
            return next(new ForbiddenError(
              `Role '${role}' is not allowed to '${action}' on '${resource}'`,
            ));
          }
        } else {
          return next(new ForbiddenError(
            `Role '${role}' is not allowed to '${action}' on '${resource}'`,
          ));
        }
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
      const studentId = extractStudentId(req);
      if (studentId) {
        const allowed = await isStudentInTeacherClass(tenantId, userId, studentId);
        if (!allowed) {
          throw new ForbiddenError('You can only access records for students in your assigned class');
        }
      }
      break;
    }

    case 'SUBSTITUTE_TEACHER': {
      // Same as teacher but only during active substitution period
      const studentId = extractStudentId(req);
      if (studentId) {
        const allowed = await isStudentInSubstituteClass(tenantId, userId, studentId);
        if (!allowed) {
          throw new ForbiddenError('You can only access records during your active substitution period');
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

    case 'CASE_REVIEWER': {
      // Read-only for assigned cases — mark on request
      (req as unknown as Record<string, unknown>)['abacAssignedOnly'] = true;
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
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
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

/**
 * Check if a student is in a class where this substitute teacher is active.
 */
async function isStudentInSubstituteClass(
  tenantId: string,
  substituteUserId: string,
  studentId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM substitution_schedule ss
       JOIN student_enrollment_history seh
         ON seh.class_name = ss.class_name
         AND seh.tenant_id = ss.tenant_id
       WHERE ss.tenant_id = $1
         AND ss.substitute_id = $2
         AND seh.student_id = $3
         AND CURRENT_DATE BETWEEN ss.start_date AND ss.end_date
         AND seh.graduated_at IS NULL`,
      [tenantId, substituteUserId, studentId],
    );
    return Number(rows[0]?.count ?? 0) > 0;
  } finally {
    client.release();
  }
}
