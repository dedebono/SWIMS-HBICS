import { queryWithTenant } from '../db/pool.js';
import type { QuisionerQuestionRow, QuisionerAnswerRow } from '@swims/shared';

export async function listQuestions(tenantId: string, listId?: string): Promise<QuisionerQuestionRow[]> {
  const params: unknown[] = [tenantId];
  let sql = `SELECT * FROM quisioner_questions WHERE tenant_id = $1 AND deleted_at IS NULL`;
  if (listId) {
    params.push(listId);
    sql += ` AND question_list_id = $${params.length}`;
  }
  sql += ` ORDER BY order_index ASC, created_at ASC`;
  const { rows } = await queryWithTenant<QuisionerQuestionRow>(tenantId, sql, params);
  return rows;
}

export async function createQuestion(tenantId: string, data: {
  question_text: string;
  question_type: 'multiple_choice' | 'checkbox' | 'text' | 'rating';
  is_required?: boolean;
  order_index?: number;
  question_list_id?: string | null;
}): Promise<QuisionerQuestionRow> {
  const { rows } = await queryWithTenant<QuisionerQuestionRow>(
    tenantId,
    `INSERT INTO quisioner_questions (tenant_id, question_text, question_type, is_required, order_index, question_list_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, data.question_text, data.question_type, data.is_required ?? true, data.order_index ?? 0, data.question_list_id ?? null],
  );
  return rows[0];
}

export async function updateQuestion(tenantId: string, questionId: string, data: {
  question_text?: string;
  question_type?: 'multiple_choice' | 'checkbox' | 'text' | 'rating';
  is_required?: boolean;
  order_index?: number;
}): Promise<QuisionerQuestionRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.question_text !== undefined) { setClauses.push(`question_text = $${idx++}`); values.push(data.question_text); }
  if (data.question_type !== undefined) { setClauses.push(`question_type = $${idx++}`); values.push(data.question_type); }
  if (data.is_required !== undefined) { setClauses.push(`is_required = $${idx++}`); values.push(data.is_required); }
  if (data.order_index !== undefined) { setClauses.push(`order_index = $${idx++}`); values.push(data.order_index); }
  setClauses.push(`updated_at = now()`);

  values.push(tenantId, questionId);

  const { rows } = await queryWithTenant<QuisionerQuestionRow>(
    tenantId,
    `UPDATE quisioner_questions SET ${setClauses.join(', ')} WHERE tenant_id = $${idx++} AND question_id = $${idx++} AND deleted_at IS NULL RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteQuestion(tenantId: string, questionId: string): Promise<boolean> {
  const { rows } = await queryWithTenant<{ count: string }>(
    tenantId,
    `UPDATE quisioner_questions SET deleted_at = now() WHERE tenant_id = $1 AND question_id = $2 AND deleted_at IS NULL RETURNING question_id`,
    [tenantId, questionId],
  );
  return rows.length > 0;
}

export async function listAnswers(tenantId: string, questionId: string): Promise<QuisionerAnswerRow[]> {
  const { rows } = await queryWithTenant<QuisionerAnswerRow>(
    tenantId,
    `SELECT * FROM quisioner_answers WHERE question_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    [questionId],
  );
  return rows;
}

export async function createAnswer(tenantId: string, questionId: string, data: {
  answer_text: string;
  score: number;
}): Promise<QuisionerAnswerRow> {
  const { rows } = await queryWithTenant<QuisionerAnswerRow>(
    tenantId,
    `INSERT INTO quisioner_answers (question_id, answer_text, score) VALUES ($1, $2, $3) RETURNING *`,
    [questionId, data.answer_text, data.score],
  );
  return rows[0];
}

export async function updateAnswer(tenantId: string, answerId: string, data: {
  answer_text?: string;
  score?: number;
}): Promise<QuisionerAnswerRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.answer_text !== undefined) { setClauses.push(`answer_text = $${idx++}`); values.push(data.answer_text); }
  if (data.score !== undefined) { setClauses.push(`score = $${idx++}`); values.push(data.score); }
  setClauses.push(`updated_at = now()`);

  values.push(tenantId, answerId);

  const { rows } = await queryWithTenant<QuisionerAnswerRow>(
    tenantId,
    `UPDATE quisioner_answers SET ${setClauses.join(', ')} WHERE tenant_id = $${idx++} AND answer_id = $${idx++} AND deleted_at IS NULL RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteAnswer(tenantId: string, answerId: string): Promise<boolean> {
  const { rows } = await queryWithTenant<{ answer_id: string }>(
    tenantId,
    `UPDATE quisioner_answers SET deleted_at = now() WHERE tenant_id = $1 AND answer_id = $2 AND deleted_at IS NULL RETURNING answer_id`,
    [tenantId, answerId],
  );
  return rows.length > 0;
}

export async function calculateScore(answers: Array<{ score: number }>): Promise<number> {
  return answers.reduce((sum, a) => sum + a.score, 0);
}

export async function getRecommendation(score: number, threshold: number = 7): Promise<'professional' | 'internal'> {
  return score >= threshold ? 'professional' : 'internal';
}

export async function submitCounselingAnswers(
  tenantId: string,
  data: {
    case_id: string;
    answers: Array<{ question_id: string; answer_text?: string; score: number }>;
    submitted_by: string;
    student_id: string;
    student_email?: string;
    parent_email?: string;
  },
): Promise<{ recommendation: 'professional' | 'internal'; submission: { submitted_at: string } | null }> {
  const score = data.answers.reduce((sum, a) => sum + a.score, 0);
  const recommendation = score >= 7 ? 'professional' : 'internal';

  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');
    for (const a of data.answers) {
      await client.query(
        `INSERT INTO quisioner_answers (tenant_id, question_id, answer_text, score) VALUES ($1, $2, $3, $4)`,
        [tenantId, a.question_id, a.answer_text ?? String(a.score), a.score],
      );
    }
    await client.query(
      `INSERT INTO counseling_submissions (tenant_id, case_id, submitted_by, student_id, recommendation, score)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, data.case_id, data.submitted_by, data.student_id, recommendation, score],
    );
    await client.query('COMMIT');
    return { recommendation, submission: { submitted_at: new Date().toISOString() } };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
