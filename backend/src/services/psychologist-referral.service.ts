import { queryWithTenant } from '../db/pool.js';
import type { ParentReferralTokenRow, SchoolPsychologistRow } from '@swims/shared';
import { auditLog } from '../utils/audit-log.js';
import { sendWhatsAppMessage } from './notifications.service.js';
import { randomUUID } from 'crypto';

// ── Token Generation ──────────────────────────────────────────────────────────

export async function createReferralToken(
  tenantId: string,
  data: {
    appointmentId: string;
    studentId: string;
    parentPhone: string;
    parentName?: string;
    caseId: string;
    studentName: string;
  },
): Promise<{ token: string; tokenId: string }> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const { rows } = await queryWithTenant<{ token_id: string }>(
    tenantId,
    `INSERT INTO parent_referral_tokens
       (tenant_id, appointment_id, student_id, parent_phone, parent_name, token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING token_id`,
    [tenantId, data.appointmentId, data.studentId, data.parentPhone,
     data.parentName ?? null, token, expiresAt],
  );

  return { token, tokenId: rows[0].token_id };
}

export async function getTokenRecord(tenantId: string, token: string): Promise<ParentReferralTokenRow | null> {
  const { rows } = await queryWithTenant<ParentReferralTokenRow>(
    tenantId,
    `SELECT * FROM parent_referral_tokens
     WHERE tenant_id = $1 AND token = $2 AND deleted_at IS NULL
       AND token_expires_at > now()`,
    [tenantId, token],
  );
  return rows[0] ?? null;
}

// ── School Psychologists ─────────────────────────────────────────────────────

export async function listSchoolPsychologists(
  tenantId: string,
): Promise<SchoolPsychologistRow[]> {
  const { rows } = await queryWithTenant<SchoolPsychologistRow>(
    tenantId,
    `SELECT * FROM school_psychologists
     WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL
     ORDER BY full_name ASC`,
    [tenantId],
  );
  return rows;
}

// ── Parent Choice ─────────────────────────────────────────────────────────────

export async function recordParentChoice(
  tenantId: string,
  token: string,
  choice: 'school_psychologist' | 'private_psychologist',
): Promise<ParentReferralTokenRow> {
  const { rows } = await queryWithTenant<ParentReferralTokenRow>(
    tenantId,
    `UPDATE parent_referral_tokens
     SET choice_status = $3, updated_at = now()
     WHERE tenant_id = $1 AND token = $2 AND deleted_at IS NULL
       AND token_expires_at > now() AND choice_status = 'pending'
     RETURNING *`,
    [tenantId, token, choice],
  );
  if (!rows[0]) throw new Error('Token tidak valid atau sudah expire');
  return rows[0];
}

// ── Psychologist Selection ────────────────────────────────────────────────────

export async function selectPsychologist(
  tenantId: string,
  token: string,
  psychologistId: string,
): Promise<ParentReferralTokenRow> {
  const { rows } = await queryWithTenant<ParentReferralTokenRow>(
    tenantId,
    `UPDATE parent_referral_tokens
     SET choice_status = 'psychologist_selected',
         selected_psychologist_id = $3,
         payment_amount = (
           SELECT consultation_fee FROM school_psychologists
           WHERE psychologist_id = $3 AND tenant_id = $1 AND deleted_at IS NULL
         ),
         updated_at = now()
     WHERE tenant_id = $1 AND token = $2 AND deleted_at IS NULL
       AND token_expires_at > now()
       AND choice_status = 'school_psychologist'
     RETURNING *`,
    [tenantId, token, psychologistId],
  );
  if (!rows[0]) throw new Error('Token tidak valid atau belum memilih psikolog sekolah');
  return rows[0];
}

// ── Payment ──────────────────────────────────────────────────────────────────

export async function setPaymentPending(
  tenantId: string,
  token: string,
): Promise<ParentReferralTokenRow> {
  const { rows } = await queryWithTenant<ParentReferralTokenRow>(
    tenantId,
    `UPDATE parent_referral_tokens
     SET choice_status = 'payment_pending', updated_at = now()
     WHERE tenant_id = $1 AND token = $2 AND deleted_at IS NULL
       AND token_expires_at > now()
       AND choice_status IN ('psychologist_selected')
     RETURNING *`,
    [tenantId, token],
  );
  if (!rows[0]) throw new Error('Token tidak valid');
  return rows[0];
}

export async function confirmPayment(
  tenantId: string,
  token: string,
  notes?: string,
): Promise<ParentReferralTokenRow> {
  const { rows } = await queryWithTenant<ParentReferralTokenRow>(
    tenantId,
    `UPDATE parent_referral_tokens
     SET choice_status = 'payment_confirmed',
         payment_confirmed_at = now(),
         payment_notes = $4,
         updated_at = now()
     WHERE tenant_id = $1 AND token = $2 AND deleted_at IS NULL
       AND token_expires_at > now()
       AND choice_status = 'payment_pending'
     RETURNING *`,
    [tenantId, token, 'payment_confirmed', notes ?? null],
  );
  if (!rows[0]) throw new Error('Token tidak valid atau status bukan payment_pending');
  return rows[0];
}

// ── Schedule Confirmation ────────────────────────────────────────────────────

export async function confirmSchedule(
  tenantId: string,
  token: string,
): Promise<ParentReferralTokenRow> {
  const { rows } = await queryWithTenant<ParentReferralTokenRow>(
    tenantId,
    `UPDATE parent_referral_tokens
     SET choice_status = 'schedule_confirmed',
         confirmed_at = now(),
         updated_at = now()
     WHERE tenant_id = $1 AND token = $2 AND deleted_at IS NULL
       AND token_expires_at > now()
       AND choice_status = 'payment_confirmed'
     RETURNING *`,
    [tenantId, token],
  );
  if (!rows[0]) throw new Error('Token tidak valid atau pembayaran belum dikonfirmasi');
  return rows[0];
}

// ── WAHA Notification ───────────────────────────────────────────────────────

export async function sendReferralNotification(
  tenantId: string,
  parentPhone: string,
  parentName: string,
  studentName: string,
  referralLink: string,
): Promise<{ success: boolean }> {
  const message = `Yth. Bapak/Ibu ${parentName || 'Orang Tua/Wali'}\n\n` +
    `Berdasarkan hasil asesmen, sekolah merekomendasikan konsultasi lanjutan dengan Psikolog ` +
    `untuk mendukung perkembangan dan kebutuhan Ananda ${studentName}.\n\n` +
    `Bapak/Ibu dapat memilih menggunakan Psikolog Rekomendasi Sekolah atau Psikolog Pribadi.\n\n` +
    `Silakan klik link berikut untuk memberikan pilihan:\n${referralLink}\n\n` +
    `Hormat kami,\nSekolah`;

  const result = await sendWhatsAppMessage(tenantId, {
    chatId: parentPhone,
    text: message,
  });

  await auditLog({
    action: 'REFERRAL_NOTIFICATION_SENT',
    entityType: 'parent_referral_tokens',
    entityId: parentPhone,
    after: { parentPhone, studentName, referralLink },
    req: undefined,
    tenantId,
    actorId: 'SYSTEM',
  });

  return result;
}
