import { queryWithTenant } from '../db/pool.js';
import type { AppointmentRow, QuisionerAnswerRow } from '@swims/shared';
import { auditLog } from '../utils/audit-log.js';

/**
 * Resolve the parent contact for a student, for the WAHA referral notification.
 *
 * The `students` table has NO `parent_phone`/`parent_name` columns — those only
 * exist on `parent_referral_tokens`. Selecting them here raised
 * "column s.parent_phone does not exist", which the surrounding try/catch
 * swallowed, so the parent was never notified even though the UI reported
 * success. `phone_number` is the parent/guardian contact the Admin UI collects.
 */
async function getParentContact(tenantId: string, studentId: string): Promise<{
  studentName: string;
  parentPhone: string | null;
  tenantSlug: string;
} | null> {
  const { rows } = await queryWithTenant<{
    student_name: string;
    parent_phone: string | null;
    tenant_slug: string;
  }>(
    tenantId,
    `SELECT s.full_name AS student_name, s.phone_number AS parent_phone, t.slug AS tenant_slug
     FROM students s
     JOIN tenants t ON t.tenant_id = s.tenant_id
     WHERE s.student_id = $1`,
    [studentId],
  );
  return rows[0]
    ? {
        studentName: rows[0].student_name,
        parentPhone: rows[0].parent_phone,
        tenantSlug: rows[0].tenant_slug,
      }
    : null;
}

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
        // created_for FKs to users(user_id); the student belongs in student_id
        data.submitted_by,
        data.student_id,
        'Menunggu psikolog mengisi ketersediaan jadwal.',
        { case_id: data.caseId, recommendation, total },
      ],
    );
    appointmentId = rows[0]?.appointment_id ?? null;

    // If professional recommendation: create referral token + send WAHA notification
    if (appointmentId) {
      try {
        const parent = await getParentContact(tenantId, data.student_id);
        if (parent?.parentPhone) {
          const { createReferralToken, sendReferralNotification } = await import('./psychologist-referral.service.js');
          const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
          const { token } = await createReferralToken(tenantId, {
            appointmentId,
            studentId: data.student_id,
            parentPhone: parent.parentPhone,
            caseId: data.caseId,
            studentName: parent.studentName,
          });
          const referralLink = `${baseUrl}/quisioner/psychologist-referral?t=${parent.tenantSlug}&token=${token}`;
          await sendReferralNotification(
            tenantId,
            parent.parentPhone,
            'Bapak/Ibu',
            parent.studentName,
            referralLink,
          );
        }
      } catch (err) {
        console.error('[counseling] Failed to send referral notification:', err);
        // Non-fatal: don't fail the quisioner submission
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
        // created_for FKs to users(user_id); the student belongs in student_id
        data.submitted_by,
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
        // created_for FKs to users(user_id); the student belongs in student_id
        data.submitted_by,
        data.student_id,
        'Menunggu psikolog mengisi ketersediaan jadwal.',
        JSON.stringify({ case_id: data.caseId, recommendation, total }),
      ],
    );

    // Send WAHA notification to parent
    try {
      const parent = await getParentContact(tenantId, data.student_id);
      if (parent?.parentPhone) {
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
            parentPhone: parent.parentPhone,
            caseId: data.caseId,
            studentName: parent.studentName,
          });
          const referralLink = `${baseUrl}/quisioner/psychologist-referral?t=${parent.tenantSlug}&token=${token}`;
          await sendReferralNotification(
            tenantId,
            parent.parentPhone,
            'Bapak/Ibu',
            parent.studentName,
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
        // created_for FKs to users(user_id); the student belongs in student_id
        data.submitted_by,
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
