import { queryWithTenant } from '../db/pool.js';
import type { AppointmentRow, QuisionerAnswerRow } from '@swims/shared';
import { auditLog } from '../utils/audit-log.js';

export async function submitCounselingQuisioner(
  tenantId: string,
  data: {
    caseId: string;
    answers: Array<{ question_id: string; answer_text: string; score: number }>;
    submitted_by: string;
    student_id: string;
  },
): Promise<{ recommendation: 'professional' | 'internal'; appointmentId: string | null }> {
  const client = await queryWithTenant(tenantId, 'SELECT 1').then(() => ({} as any));
  // Use transaction via raw client is not directly exported, reuse queryWithTenant with implicit transaction? 
  // Skip transaction for now; insert answers individually.
  for (const a of data.answers) {
    await queryWithTenant(
      tenantId,
      `INSERT INTO quisioner_answers (tenant_id, question_id, answer_text, score)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, a.question_id, a.answer_text, a.score],
    );
  }

  const scores = data.answers.map(a => a.score);
  const total = scores.reduce((sum, s) => sum + s, 0);
  const recommendation = total >= 7 ? 'professional' : 'internal';

  let appointmentId: string | null = null;
  if (recommendation === 'professional') {
    const { rows } = await queryWithTenant<AppointmentRow>(
      tenantId,
      `INSERT INTO appointments (tenant_id, type, status, created_by, created_for, student_id, notes, metadata)
       VALUES ($1, 'student', 'awaiting_psychologist_availability', $2, $3, $4, $5, $6)
       RETURNING appointment_id`,
      [
        tenantId,
        data.submitted_by,
        data.student_id,
        data.student_id,
        'Menunggu psikolog mengisi ketersediaan jadwal.',
        { case_id: data.caseId, recommendation, total },
      ],
    );
    appointmentId = rows[0]?.appointment_id ?? null;
  } else {
    const { rows } = await queryWithTenant<AppointmentRow>(
      tenantId,
      `INSERT INTO appointments (tenant_id, type, status, created_by, created_for, student_id, counselor_id, notes, metadata)
       VALUES ($1, 'student', 'pending', $2, $3, $4, $5, $6, $7)
       RETURNING appointment_id`,
      [
        tenantId,
        data.submitted_by,
        data.student_id,
        data.student_id,
        data.submitted_by,
        'Internal counseling direction.',
        { case_id: data.caseId, recommendation, total },
      ],
    );
    appointmentId = rows[0]?.appointment_id ?? null;
  }

  await auditLog({
    action: 'COUNSELING_QUISIONER_SUBMITTED',
    entityType: 'quisioner_answers',
    entityId: data.caseId,
    after: { recommendation, total, answer_count: data.answers.length },
    tenantId,
    actorId: data.submitted_by,
  });

  return { recommendation, appointmentId };
}
