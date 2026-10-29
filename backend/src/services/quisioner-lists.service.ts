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
 * The two counseling domains are SEPARATE products with separate questionnaires.
 * They must never borrow each other's question set.
 *
 * - STUDENT — the teacher's "Janji Temu" tab on a case (a student's wellbeing).
 * - STAFF   — personal/employee counseling for a staff member (PERSONAL role),
 *             including the public QR flow at /book/staff.
 *
 * A list belongs to a domain by the targets it carries. `appointment_student`
 * and `appointment_case` are the student domain; `staff` is the staff domain.
 */
export const STUDENT_COUNSELING_TARGETS = ['appointment_student', 'appointment_case'] as const;
export const STAFF_COUNSELING_TARGETS = ['staff'] as const;

export type CounselingDomain = 'student' | 'staff';

export function targetsForDomain(domain: CounselingDomain): string[] {
  return domain === 'staff' ? [...STAFF_COUNSELING_TARGETS] : [...STUDENT_COUNSELING_TARGETS];
}

/**
 * Resolve the single active question list for a counseling domain.
 *
 * **Matching rule (2026-10-22): a domain-specific list WINS over a catch-all.**
 *
 * The query first looks for a list carrying EVERY target of the requested
 * domain, and only then accepts one that merely overlaps. Reason: a tenant can
 * legitimately have a catch-all list tagged with all three targets, and the old
 * overlap-only rule (`targets ?| $2`) picked purely by `updated_at`, so editing
 * the catch-all list silently swapped the questionnaire the teachers saw.
 *
 * The overlap fallback is kept deliberately, but it can no longer return a list
 * from the OTHER domain: an `appointment_case` list matches the student domain
 * and a `staff` list matches the staff domain, and the ordering below keeps
 * those apart unless the tenant has mis-tagged a list — which migration 054
 * repairs.
 */
export async function getActiveListForDomain(
  tenantId: string,
  domain: CounselingDomain,
): Promise<QuestionListRow | null> {
  const targets = targetsForDomain(domain);

  const { rows } = await queryWithTenant<QuestionListRow>(
    tenantId,
    `SELECT * FROM quisioner_question_lists l
     WHERE l.tenant_id = $1 AND l.is_active = true AND l.deleted_at IS NULL
       AND l.targets ?| $2::text[]
       -- Never resolve a domain to an EMPTY questionnaire. An admin scratch
       -- list (e.g. "Pertanyaan saja", 0 questions) can out-rank the real one
       -- on updated_at and leave the form with nothing to render — which reads
       -- to the user as "Belum ada pertanyaan", not as a config problem.
       AND EXISTS (
         SELECT 1 FROM quisioner_questions q
         WHERE q.question_list_id = l.question_list_id AND q.deleted_at IS NULL
       )
     ORDER BY
       -- 1) exact/most-specific match first: a list that carries EVERY target
       --    of this domain beats a catch-all list. The targets column is jsonb,
       --    so membership is tested by casting the requested target to jsonb —
       --    there is no "jsonb @> text[]" operator and Postgres rejects it with
       --    42883 "operator does not exist".
       (SELECT count(*) FROM unnest($2::text[]) t
        WHERE l.targets @> to_jsonb(ARRAY[t])) DESC,
       -- 2) then the most recently updated.
       l.updated_at DESC
     LIMIT 1`,
    [tenantId, targets],
  );
  return rows[0] ?? null;
}

/**
 * Back-compat wrapper. Prefer {@link getActiveListForDomain} — passing a bare
 * target array here is what allowed the student/staff domains to bleed together.
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
