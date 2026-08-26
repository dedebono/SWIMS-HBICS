import { queryWithTenant } from '../db/pool.js';
import type { QuestionListRow } from '@swims/shared';

export const LIST_TARGETS = ['staff', 'appointment_student', 'appointment_case'] as const;
export type ListTarget = (typeof LIST_TARGETS)[number];

function sanitizeTargets(targets: string[] | undefined): string[] {
  if (!targets || !Array.isArray(targets)) return [];
  return targets.filter((t) => (LIST_TARGETS as readonly string[]).includes(t));
}

export async function listQuestionLists(tenantId: string): Promise<QuestionListRow[]> {
  const { rows } = await queryWithTenant<QuestionListRow>(
    tenantId,
    `SELECT * FROM quisioner_question_lists WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    [tenantId],
  );
  return rows;
}

export async function getQuestionList(tenantId: string, listId: string): Promise<QuestionListRow | null> {
  const { rows } = await queryWithTenant<QuestionListRow>(
    tenantId,
    `SELECT * FROM quisioner_question_lists WHERE tenant_id = $1 AND question_list_id = $2 AND deleted_at IS NULL`,
    [tenantId, listId],
  );
  return rows[0] ?? null;
}

export async function createQuestionList(
  tenantId: string,
  data: { name: string; description?: string; targets: string[]; is_active?: boolean },
): Promise<QuestionListRow> {
  const { rows } = await queryWithTenant<QuestionListRow>(
    tenantId,
    `INSERT INTO quisioner_question_lists (tenant_id, name, description, targets, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [tenantId, data.name, data.description ?? null, JSON.stringify(sanitizeTargets(data.targets)), data.is_active ?? true],
  );
  return rows[0];
}

export async function updateQuestionList(
  tenantId: string,
  listId: string,
  data: { name?: string; description?: string; targets?: string[]; is_active?: boolean },
): Promise<QuestionListRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${idx++}`);
    values.push(data.description);
  }
  if (data.targets !== undefined) {
    setClauses.push(`targets = $${idx++}::jsonb`);
    values.push(JSON.stringify(sanitizeTargets(data.targets)));
  }
  if (data.is_active !== undefined) {
    setClauses.push(`is_active = $${idx++}`);
    values.push(data.is_active);
  }
  setClauses.push(`updated_at = now()`);
  values.push(tenantId, listId);

  const { rows } = await queryWithTenant<QuestionListRow>(
    tenantId,
    `UPDATE quisioner_question_lists
     SET ${setClauses.join(', ')}
     WHERE tenant_id = $${idx++} AND question_list_id = $${idx++} AND deleted_at IS NULL
     RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteQuestionList(tenantId: string, listId: string): Promise<boolean> {
  const { rows } = await queryWithTenant<{ id: string }>(
    tenantId,
    `UPDATE quisioner_question_lists SET deleted_at = now() WHERE tenant_id = $1 AND question_list_id = $2 AND deleted_at IS NULL RETURNING question_list_id`,
    [tenantId, listId],
  );
  return rows.length > 0;
}

export async function getQuestionsByList(tenantId: string, listId: string): Promise<unknown[]> {
  const { rows } = await queryWithTenant(
    tenantId,
    `SELECT * FROM quisioner_questions WHERE tenant_id = $1 AND question_list_id = $2 AND deleted_at IS NULL ORDER BY order_index ASC, created_at ASC`,
    [tenantId, listId],
  );
  return rows;
}

/**
 * Ambil daftar aktif yang menargetkan salah satu dari `targets`.
 * Digunakan oleh flow Staff (target 'staff') dan Janji Temu (target appointment_*).
 */
export async function getActiveListForTargets(tenantId: string, targets: string[]): Promise<QuestionListRow | null> {
  const { rows } = await queryWithTenant<QuestionListRow>(
    tenantId,
    `SELECT * FROM quisioner_question_lists
     WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL AND targets ?| $2::text[]
     ORDER BY updated_at DESC
     LIMIT 1`,
    [tenantId, targets],
  );
  return rows[0] ?? null;
}
