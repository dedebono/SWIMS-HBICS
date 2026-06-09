import type { Request, Response, NextFunction } from 'express';
import { PERMISSIONS, type Resource, type Action } from '@swims/shared';
import type { Role } from '@swims/shared';
import { ForbiddenError } from '../utils/errors.js';
import { pool } from '../db/pool.js';
import { hasSharedAccess } from '../services/case-shares.service.js';

// ─── ABAC result cache (TTL: 60s) ───────────────────────────────────────────────
// Prevents pool exhaustion when many teachers access cases simultaneously.
// Short TTL is acceptable since class assignments don't change every minute.
interface CacheEntry { value: boolean; expiresAt: number; }
const abacCache = new Map<string, CacheEntry>();
const ABAC_CACHE_TTL_MS = 60_000;

function getCached(key: string): boolean | undefined {
  const entry = abacCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    abacCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key: string, value: boolean): void {
  // Prune stale entries lazily (every 50 writes)
  if (abacCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of abacCache) {
      if (now > v.expiresAt) abacCache.delete(k);
    }
  }
  abacCache.set(key, { value, expiresAt: Date.now() + ABAC_CACHE_TTL_MS });
}

const cacheKey = (tenantId: string, teacherId: string, studentId: string) =>
  `${tenantId}:${teacherId}:${studentId}`;

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
      console.log(`[Permission Check] Starting for Role: ${role}, Resource: ${resource}, Action: ${action}`);

      // ── Step 1: RBAC check ──────────────────────────────────────────────
      const rolePerms = PERMISSIONS[role];
      if (!rolePerms) {
        console.error(`[RBAC Error] Unknown role: ${role}`);
        return next(new ForbiddenError(`Unknown role: ${role}`));
      }

      const resourcePerms = rolePerms[resource];
      console.log(`[Permission Check] rolePerms[${resource}]: `, resourcePerms);
      if (!resourcePerms) {
        console.error(`[RBAC Error] No permissions defined for resource: ${resource} for role: ${role}`);
        return next(new ForbiddenError(`No permissions defined for resource: ${resource}`));
      }

      if (!resourcePerms[action]) {
        console.error(`[RBAC Error] Role '${role}' is not allowed to '${action}' on '${resource}'`);
        return next(new ForbiddenError(
          `Role '${role}' is not allowed to '${action}' on '${resource}'`,
        ));
      }
      console.log(`[Permission Check] RBAC passed for Role: ${role}, Resource: ${resource}, Action: ${action}`);

      // ── Step 2: ABAC contextual checks ──────────────────────────────────
      await enforceAbac(req, role, resource, action);
      console.log(`[Permission Check] ABAC passed for Role: ${role}, Resource: ${resource}, Action: ${action}`);

      next();
    } catch (err) {
      if (err instanceof ForbiddenError) {
        console.error(`[Permission Error] Forbidden: ${err.message}. Role: ${req.userRole}, Resource: ${resource}, Action: ${action}`);
        return next(err);
      }
      console.error(`[Permission Error] Unexpected error: ${err}. Role: ${req.userRole}, Resource: ${resource}, Action: ${action}`);
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
      // Teachers may generally only access records for students in their assigned class,
      // EXCEPT when reporting an incident (creating cases/incidents) or looking up basic student info.
      if (_action === 'create' && (resource === 'incidents' || resource === 'cases')) break;
      if (resource === 'students' && _action === 'read' && !req.path.includes('/timeline')) break;
      if (resource === 'cases' && _action === 'read' && !req.params['caseId']) break; // allow listing cases (service filters by teacher_id)

      // Allow access if teacher has been shared this case
      if (resource === 'cases' && _action === 'read' && req.params['caseId']) {
        const allowed = await hasSharedAccess(tenantId, String(req.params['caseId']), userId);
        if (allowed) break; // teacher has shared access — allow
      }

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
      // Same exceptions as teacher
      if (_action === 'create' && (resource === 'incidents' || resource === 'cases')) break;
      if (resource === 'students' && _action === 'read' && !req.path.includes('/timeline')) break;
      if (resource === 'cases' && _action === 'read' && !req.params['caseId']) break;

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
      // No specific ABAC rules for IT_ADMIN for /admin/* routes.
      // RBAC matrix already defines their access.
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
  const key = `teacher:${cacheKey(tenantId, teacherUserId, studentId)}`;
  const cached = getCached(key);
  if (cached !== undefined) return cached;

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
    const allowed = Number(rows[0]?.count ?? 0) > 0;
    setCached(key, allowed);
    return allowed;
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
  const key = `sub:${cacheKey(tenantId, substituteUserId, studentId)}`;
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
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
    const allowed = Number(rows[0]?.count ?? 0) > 0;
    setCached(key, allowed);
    return allowed;
  } finally {
    client.release();
  }
}
