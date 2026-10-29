import { queryWithTenant, getClientWithTenant } from '../db/pool.js';
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
  slotId: string,
): Promise<ParentReferralTokenRow> {
  const record = await getTokenRecord(tenantId, token);
  if (!record || record.choice_status !== 'payment_confirmed') {
    throw new Error('Token tidak valid atau pembayaran belum dikonfirmasi');
  }

  // The chosen slot must be free, future, and belong to the psychologist the
  // parent selected (availability_slots.professional_id ↔ school_psychologists.user_id).
  const { rows: slotRows } = await queryWithTenant<{
    slot_id: string;
    slot_start: string;
    professional_id: string;
  }>(
    tenantId,
    `SELECT s.slot_id, s.slot_start, s.professional_id
     FROM availability_slots s
     JOIN school_psychologists sp ON sp.user_id = s.professional_id
       AND sp.tenant_id = s.tenant_id AND sp.deleted_at IS NULL
     WHERE s.slot_id = $1 AND s.tenant_id = $2 AND s.deleted_at IS NULL
       AND s.is_available = true AND s.appointment_id IS NULL
       AND s.slot_start > now()
       AND sp.psychologist_id = $3`,
    [slotId, tenantId, record.selected_psychologist_id],
  );
  const slot = slotRows[0];
  if (!slot) throw new Error('Slot tidak tersedia atau sudah diisi');

  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');

    const { rows: tokenRows } = await client.query<ParentReferralTokenRow>(
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
    if (!tokenRows[0]) {
      await client.query('ROLLBACK');
      throw new Error('Token tidak valid atau pembayaran belum dikonfirmasi');
    }

    // Booking is real now: appointment goes `confirmed` with the slot's time
    // and the psychologist attached, and the slot is marked taken so nobody
    // else can book it.
    const { rows: apptRows } = await client.query(
      `UPDATE appointments
       SET status = 'confirmed',
           scheduled_at = $1,
           psychologist_id = $2,
           notes = 'Jadwal dikonfirmasi orang tua.',
           updated_at = now()
       WHERE appointment_id = $3 AND tenant_id = $4 AND deleted_at IS NULL
       RETURNING appointment_id`,
      [slot.slot_start, slot.professional_id, record.appointment_id, tenantId],
    );
    if (!apptRows[0]) {
      await client.query('ROLLBACK');
      throw new Error('Janji temu tidak ditemukan');
    }

    await client.query(
      `UPDATE availability_slots
       SET appointment_id = $1, is_available = false, updated_at = now()
       WHERE slot_id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
      [record.appointment_id, slotId, tenantId],
    );

    await client.query('COMMIT');
    return tokenRows[0];
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  } finally {
    client.release();
  }
}

// ─── Parent Slot Listing (public, token-guarded) ────────────────────────────

export async function listParentSlots(
  tenantId: string,
  token: string,
): Promise<Array<{ slot_id: string; slot_start: string; slot_end: string }>> {
  const record = await getTokenRecord(tenantId, token);
  if (!record || record.choice_status !== 'payment_confirmed' || !record.selected_psychologist_id) {
    return [];
  }
  const { rows } = await queryWithTenant<{
    slot_id: string;
    slot_start: string;
    slot_end: string;
  }>(
    tenantId,
    `SELECT s.slot_id, s.slot_start, s.slot_end
     FROM availability_slots s
     JOIN school_psychologists sp ON sp.user_id = s.professional_id
       AND sp.tenant_id = s.tenant_id AND sp.deleted_at IS NULL
     WHERE sp.psychologist_id = $1 AND s.tenant_id = $2 AND s.deleted_at IS NULL
       AND s.is_available = true AND s.appointment_id IS NULL
       AND s.slot_start > now()
     ORDER BY s.slot_start ASC`,
    [record.selected_psychologist_id, tenantId],
  );
  return rows;
}

// ─── Parent Invite (sent from the case view) ─────────────────────────────────

export async function getReferralContext(
  tenantId: string,
  appointmentId: string,
): Promise<{
  appointment_id: string;
  student_id: string;
  case_id: string | null;
  student_name: string;
  parent_phone: string | null;
} | null> {
  const { rows } = await queryWithTenant<{
    appointment_id: string;
    student_id: string;
    case_id: string | null;
    student_name: string;
    parent_phone: string | null;
  }>(
    tenantId,
    `SELECT a.appointment_id, a.student_id,
            a.metadata->>'case_id' AS case_id,
            s.full_name AS student_name,
            COALESCE(NULLIF(s.phone_number, ''), a.metadata->>'invite_parent_phone') AS parent_phone
     FROM appointments a
     JOIN students s ON s.student_id = a.student_id
     WHERE a.appointment_id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
    [appointmentId, tenantId],
  );
  return rows[0] ?? null;
}

export async function sendParentInvite(
  tenantId: string,
  appointmentId: string,
  actorId: string,
  data: { parentPhone?: string; message: string },
): Promise<{ success: boolean; referralLink: string; parentPhone: string }> {
  const ctx = await getReferralContext(tenantId, appointmentId);
  if (!ctx) throw new Error('Janji temu tidak ditemukan');

  const parentPhone = (data.parentPhone ?? '').trim() || ctx.parent_phone;
  if (!parentPhone) throw new Error('Nomor WhatsApp orang tua belum tersedia — isi dulu di form.');

  const { rows: tenantRows } = await queryWithTenant<{ slug: string }>(
    tenantId,
    `SELECT slug FROM tenants WHERE tenant_id = $1`,
    [tenantId],
  );
  const slug = tenantRows[0]?.slug ?? '';

  const { token } = await createReferralToken(tenantId, {
    appointmentId,
    studentId: ctx.student_id,
    parentPhone,
    caseId: ctx.case_id ?? '',
    studentName: ctx.student_name,
  });
  const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
  const referralLink = `${baseUrl}/quisioner/psychologist-referral?t=${slug}&token=${token}`;

  // The teacher's template is the message body; the secure link is appended by
  // the system so it can never be edited out accidentally.
  const result = await sendWhatsAppMessage(tenantId, {
    chatId: parentPhone,
    text: `${data.message.trim()}\n\n${referralLink}`,
  });

  // Persist the phone the teacher typed ONLY on the appointment's metadata —
  // never on the student record. Sending an invite must not become a student
  // data change (TEACHER is not allowed to edit students).
  await queryWithTenant(
    tenantId,
    `UPDATE appointments
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{invite_parent_phone}', to_jsonb($1::text), true),
         updated_at = now()
     WHERE appointment_id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
    [parentPhone, appointmentId, tenantId],
  );

  await queryWithTenant(
    tenantId,
    `UPDATE appointments SET notes = 'Undangan terkirim ke orang tua — menunggu pemilihan jadwal.', updated_at = now()
     WHERE appointment_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [appointmentId, tenantId],
  );

  await auditLog({
    action: 'REFERRAL_INVITE_SENT',
    entityType: 'appointments',
    entityId: appointmentId,
    after: { parentPhone, referralLink, waSuccess: result.success },
    tenantId,
    actorId,
  });

  return { success: result.success, referralLink, parentPhone };
}

// ── WhatsApp Notification ──────────────────────────────────────────────────

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
