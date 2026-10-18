import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { auditLog } from '../utils/audit-log.js';
import { notifyUsers } from './notifications.service.js';
import type { Request } from 'express';

export interface ShareCaseInput {
  shared_with: string[]; // array of user_ids to share with
  permission?: 'VIEW' | 'CONTRIBUTE';
}

export interface CaseShareRow {
  share_id: string;
  case_id: string;
  shared_with: string;
  shared_by: string;
  shared_by_name?: string;
  shared_with_name?: string;
  shared_with_role?: string;
  permission: string;
  created_at: string;
}

export interface TeacherListItem {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

/**
 * Share a case with one or more teachers.
 */
	// ─── Create ───────────────────────────────────────────────────────────────────

export async function shareCase(
  tenantId: string,
  caseId: string,
  input: ShareCaseInput,
  actorId: string,
  req?: Request,
): Promise<CaseShareRow[]> {
  // Verify case exists
  const caseRows = await queryWithTenant<{ case_id: string }>(
    tenantId,
    'SELECT case_id FROM cases WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [caseId, tenantId],
  );
  if (caseRows.rows.length === 0) {
    throw new NotFoundError('Case', caseId);
  }

  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');

    const permission = input.permission || 'VIEW';
    const results: CaseShareRow[] = [];
    const skipped: string[] = [];

    // Batch verify users exist in one query
    const userRows = await client.query<{ user_id: string; full_name: string; role: string }>(
      `SELECT user_id, full_name, role FROM users
       WHERE user_id = ANY($1::uuid[]) AND tenant_id = $2 AND deleted_at IS NULL`,
      [input.shared_with, tenantId],
    );
    const validUserIds = new Set(userRows.rows.map(r => r.user_id));

    // Batch check existing shares in one query
    const existingRows = await client.query<{ shared_with: string }>(
      `SELECT shared_with FROM case_shares
       WHERE tenant_id = $1 AND case_id = $2 AND shared_with = ANY($3::uuid[])`,
      [tenantId, caseId, input.shared_with],
    );
    const alreadyShared = new Set(existingRows.rows.map(r => r.shared_with));

    for (const userId of input.shared_with) {
      if (!validUserIds.has(userId)) {
        skipped.push(userId);
        continue;
      }

      if (alreadyShared.has(userId)) {
        skipped.push(userId);
        continue;
      }

      const { rows } = await client.query<CaseShareRow>(
        `INSERT INTO case_shares (tenant_id, case_id, shared_with, shared_by, permission)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, caseId, userId, actorId, permission],
      );
      results.push(rows[0]!);
    }

    await client.query('COMMIT');

    if (results.length > 0) {
      await auditLog({
        action: 'CASE_SHARED',
        entityType: 'case_shares',
        entityId: caseId,
        after: { shared_with: results.map(r => r.shared_with), permission },
        req,
        tenantId,
        actorId,
      });

      // "Kasus dibagikan" — kabari setiap penerima share. Never throws.
      await notifyUsers(tenantId, results.map(r => r.shared_with), {
        type: 'CASE_SHARED',
        title: 'Kasus dibagikan kepada Anda',
        body: `Anda kini dapat ${permission === 'EDIT' ? 'mengedit' : 'melihat'} kasus yang dibagikan.`,
        link: `/dashboard/cases/${caseId}`,
      }, { excludeUserId: actorId });
    }

    if (skipped.length > 0 && results.length === 0) {
      throw new ValidationError('All specified users are already shared with this case or do not exist.');
    }

    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List all teachers a case is shared with.
 */
export async function listCaseShares(
  tenantId: string,
  caseId: string,
): Promise<CaseShareRow[]> {
  const { rows } = await queryWithTenant<CaseShareRow>(
    tenantId,
    `SELECT
       cs.share_id, cs.case_id, cs.shared_with, cs.shared_by, cs.permission, cs.created_at,
       u.full_name as shared_with_name, u.role as shared_with_role,
       ub.full_name as shared_by_name
     FROM case_shares cs
     JOIN users u ON u.user_id = cs.shared_with
     JOIN users ub ON ub.user_id = cs.shared_by
     WHERE cs.tenant_id = $1 AND cs.case_id = $2
     ORDER BY cs.created_at DESC`,
    [tenantId, caseId],
  );
  return rows;
}

/**
 * Remove a share (unshare case with a specific user).
 */
export async function removeShare(
  tenantId: string,
  caseId: string,
  userId: string,
  actorId: string,
  req?: Request,
): Promise<void> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `DELETE FROM case_shares
     WHERE tenant_id = $1 AND case_id = $2 AND shared_with = $3`,
    [tenantId, caseId, userId],
  );

  if (rowCount === 0) {
    throw new NotFoundError('CaseShare', `${caseId}/${userId}`);
  }

  await auditLog({
    action: 'CASE_UNSHARED',
    entityType: 'case_shares',
    entityId: caseId,
    after: { removed_user: userId },
    req,
    tenantId,
    actorId,
  });
}

/**
 * Check if a user has shared access to a case.
 */
export async function hasSharedAccess(
  tenantId: string,
  caseId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) as count FROM case_shares
     WHERE tenant_id = $1 AND case_id = $2 AND shared_with = $3`,
    [tenantId, caseId, userId],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

/**
 * Get list of available teachers (for share picker UI).
 * Supports optional pagination; no limit = returns all (max 500 for safety).
 */
export async function listAvailableTeachers(
  tenantId: string,
  page?: number,
  pageSize: number = 50,
): Promise<{ rows: TeacherListItem[]; total: number; page: number; hasMore: boolean }> {
  const offset = page ? (page - 1) * pageSize : 0;
  const useLimit = !page || page > 0;

  const baseQuery =
    `FROM users
     WHERE tenant_id = $1
       AND deleted_at IS NULL
       AND is_active = true
       AND role IN ('TEACHER', 'SUBSTITUTE_TEACHER', 'COUNSELOR', 'SCHOOL_HEAD')`;

  const [{ rows: rows }, { rows: countRows }] = await Promise.all([
    queryWithTenant<TeacherListItem>(
      tenantId,
      `SELECT user_id, full_name, email, role ${baseQuery}
       ORDER BY full_name ASC
       ${useLimit ? `LIMIT ${pageSize} OFFSET ${offset}` : 'LIMIT 500'}`,
      [tenantId],
    ),
    queryWithTenant<{ total: string }>(
      tenantId,
      `SELECT COUNT(*) as total ${baseQuery}`,
      [tenantId],
    ),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  return {
    rows,
    total,
    page: page ?? 1,
    hasMore: useLimit ? offset + pageSize < total : false,
  };
}
