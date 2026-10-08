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

    // If professional recommendation: create referral token + send WAHA notification
    if (appointmentId) {
      // Get student + parent info + tenant slug
      const { rows: studentRows } = await queryWithTenant<any>(
        tenantId,
        `SELECT s.full_name as student_name, s.parent_phone, s.parent_name, t.slug as tenant_slug
         FROM students s
         JOIN tenants t ON t.tenant_id = s.tenant_id
         WHERE s.student_id = $1`,
        [data.student_id],
      );
      const student = studentRows[0];
      if (student?.parent_phone) {
        try {
          const { createReferralToken, sendReferralNotification } = await import('./psychologist-referral.service.js');
          const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
          const { token } = await createReferralToken(tenantId, {
            appointmentId,
            studentId: data.student_id,
            parentPhone: student.parent_phone,
            parentName: student.parent_name ?? undefined,
            caseId: data.caseId,
            studentName: student.student_name,
          });
          const referralLink = `${baseUrl}/quisioner/psychologist-referral?t=${student.tenant_slug}&token=${token}`;
          await sendReferralNotification(
            tenantId,
            student.parent_phone,
            student.parent_name ?? 'Bapak/Ibu',
            student.student_name,
            referralLink,
          );
        } catch (err) {
          console.error('[counseling] Failed to send referral notification:', err);
          // Non-fatal: don't fail the quisioner submission
        }
      }
    }
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

// ─── Case Counseling (GET/POST /cases/:caseId/counseling) ───────────────────

export interface CounselingSubmissionRow {
  submission_id: string;
  tenant_id: string;
  case_id: string;
  submitted_by: string;
  student_id: string;
  recommendation: 'professional' | 'internal';
  score: number;
  answers: unknown[];
  submitted_at: Date | null;
}

export async function getCaseCounseling(
  tenantId: string,
  caseId: string,
): Promise<CounselingSubmissionRow | null> {
  const { rows } = await queryWithTenant<CounselingSubmissionRow>(
    tenantId,
    `SELECT submission_id, tenant_id, case_id, submitted_by, student_id,
            recommendation, score, answers, submitted_at
     FROM counseling_submissions
     WHERE case_id = $1 AND deleted_at IS NULL
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [caseId],
  );
  return rows[0] ?? null;
}

export async function submitCaseCounseling(
  tenantId: string,
  data: {
    caseId: string;
    answers: Array<{ question_id: string; answer_text: string; score: number }>;
    submitted_by: string;
    student_id: string;
  },
): Promise<CounselingSubmissionRow> {
  const total = data.answers.reduce((sum, a) => sum + a.score, 0);
  const recommendation: 'professional' | 'internal' = total >= 7 ? 'professional' : 'internal';

  // Check if submission already exists
  const existing = await getCaseCounseling(tenantId, data.caseId);
  if (existing) {
    throw Object.assign(new Error('Submission already exists for this case'), { code: 'CONFLICT' });
  }

  // Insert into counseling_submissions
  const { rows: submissionRows } = await queryWithTenant<CounselingSubmissionRow>(
    tenantId,
    `INSERT INTO counseling_submissions
       (tenant_id, case_id, submitted_by, student_id, recommendation, score, answers)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING submission_id, tenant_id, case_id, submitted_by, student_id,
               recommendation, score, answers, submitted_at`,
    [tenantId, data.caseId, data.submitted_by, data.student_id, recommendation, total, JSON.stringify(data.answers)],
  );

  const submission = submissionRows[0];

  // Create appointment based on recommendation
  if (recommendation === 'professional') {
    await queryWithTenant(
      tenantId,
      `INSERT INTO appointments (tenant_id, type, status, created_by, created_for, student_id, notes, metadata)
       VALUES ($1, 'student', 'awaiting_psychologist_availability', $2, $3, $4, $5, $6)`,
      [
        tenantId,
        data.submitted_by,
        data.student_id,
        data.student_id,
        'Menunggu psikolog mengisi ketersediaan jadwal.',
        JSON.stringify({ case_id: data.caseId, recommendation, total }),
      ],
    );

    // Send WAHA notification to parent
    try {
      const { rows: studentRows } = await queryWithTenant<any>(
        tenantId,
        `SELECT s.full_name as student_name, s.parent_phone, s.parent_name, t.slug as tenant_slug
         FROM students s
         JOIN tenants t ON t.tenant_id = s.tenant_id
         WHERE s.student_id = $1`,
        [data.student_id],
      );
      const student = studentRows[0];
      if (student?.parent_phone) {
        const { createReferralToken, sendReferralNotification } = await import('./psychologist-referral.service.js');
        const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
        const { rows: apptRows } = await queryWithTenant<any>(
          tenantId,
          `SELECT appointment_id FROM appointments
           WHERE student_id = $1 AND metadata->>'case_id' = $2
           ORDER BY created_at DESC LIMIT 1`,
          [data.student_id, data.caseId],
        );
        if (apptRows[0]) {
          const { token } = await createReferralToken(tenantId, {
            appointmentId: apptRows[0].appointment_id,
            studentId: data.student_id,
            parentPhone: student.parent_phone,
            parentName: student.parent_name ?? undefined,
            caseId: data.caseId,
            studentName: student.student_name,
          });
          const referralLink = `${baseUrl}/quisioner/psychologist-referral?t=${student.tenant_slug}&token=${token}`;
          await sendReferralNotification(
            tenantId,
            student.parent_phone,
            student.parent_name ?? 'Bapak/Ibu',
            student.student_name,
            referralLink,
          );
        }
      }
    } catch (err) {
      console.error('[counseling] Failed to send referral notification:', err);
    }
  } else {
    await queryWithTenant(
      tenantId,
      `INSERT INTO appointments (tenant_id, type, status, created_by, created_for, student_id, counselor_id, notes, metadata)
       VALUES ($1, 'student', 'pending', $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        data.submitted_by,
        data.student_id,
        data.student_id,
        data.submitted_by,
        'Internal counseling direction.',
        JSON.stringify({ case_id: data.caseId, recommendation, total }),
      ],
    );
  }

  await auditLog({
    action: 'COUNSELING_QUISIONER_SUBMITTED',
    entityType: 'counseling_submissions',
    entityId: submission.submission_id,
    after: { recommendation, total, answer_count: data.answers.length },
    tenantId,
    actorId: data.submitted_by,
  });

  return submission;
}
