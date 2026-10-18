import { queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { ValidationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { hashNationalId } from '../utils/encryption.js';
import { createAppointment, confirmAppointment, updateAvailabilitySlot } from './appointments.service.js';
import { createNotification, notifyRoles, ADMIN_ROLES } from './notifications.service.js';
import { detectHighPriority } from './employee-counseling.service.js';
import type { CreateSubmissionInput } from '@swims/shared';

/**
 * The combined public intake: NIK verification + questionnaire + slot booking,
 * submitted as ONE request.
 *
 * Why this exists
 * ───────────────
 * `/book/staff` wrote an `appointments` row and `/quisioner/employee-counseling`
 * wrote an `employee_counseling_submissions` row, with nothing joining them. A
 * counselor could not see who had booked, and an intake had no schedule. This
 * module produces both rows, links them, and guarantees they agree — the whole
 * point being that the counselor dashboard shows ONE row per person.
 *
 * Consistency
 * ───────────
 * There is no transaction available here (`queryWithTenant` runs on a pool, not a
 * shared client), so failure handling is explicit compensation: whichever half
 * lands second is undone if the other throws. The ordering matters — the booking
 * is made first because it is the step that consumes a scarce resource (an
 * availability slot). If the intake then fails, the appointment is cancelled and
 * the slot is released, so the counselor's calendar ends up exactly as it started.
 */

export interface CombinedIntakeInput extends CreateSubmissionInput {
  /** NIK of the employee. Verified against `users.national_id_hash`. */
  nik: string;
  /** The availability slot chosen in the last step. */
  slot_id: string;
}

export interface CombinedIntakeResult {
  submission_id: string;
  appointment_id: string;
  counselor_id: string;
  counselor_name: string;
  scheduled_at: string;
  is_high_priority: boolean;
  booking_status: 'combined';
}

/**
 * The PERSONAL staff account a NIK resolves to.
 *
 * Only columns that actually exist on `users` are selected. The full column list
 * is: user_id, tenant_id, full_name, email, password_hash, role, is_active,
 * created_at, deleted_at, gender, national_id, national_id_hash, avatar_key,
 * avatar_updated_at. There is NO phone, unit or position column — selecting any
 * of them makes every identity check die with `column "…" does not exist`, i.e. a
 * 500 on the very first step of a public, unauthenticated flow.
 *
 * Pre-filling Section A is therefore limited to the name and gender; the employee
 * types their own unit/position/contact once.
 */
interface StaffAccount {
  user_id: string;
  full_name: string;
  gender: string | null;
  email: string | null;
}

const STAFF_SELECT = `user_id, full_name, gender, email`;

/** Resolve a NIK to its active PERSONAL staff account, or null. */
async function findStaffByNik(tenantId: string, nik: string): Promise<StaffAccount | null> {
  const { rows } = await queryWithTenant<StaffAccount>(
    tenantId,
    `SELECT ${STAFF_SELECT} FROM users
     WHERE tenant_id = $1 AND national_id_hash = $2 AND role = 'PERSONAL' AND is_active = true`,
    [tenantId, hashNationalId(nik)],
  );
  return rows[0] ?? null;
}

/**
 * NIK verification that also returns everything the combined flow needs, so the
 * questionnaire can be pre-filled with the real record instead of the employee
 * re-typing data we already hold. Never echoes the NIK itself.
 */
export async function verifyIdentityForCombined(
  tenantId: string,
  nik: string,
): Promise<{
  valid: boolean;
  staff_name?: string;
  gender?: string;
  email?: string;
  has_open_intake?: boolean;
}> {
  if (!nik || !nik.trim()) return { valid: false };
  const staff = await findStaffByNik(tenantId, nik);
  if (!staff) return { valid: false };

  // Tell the page whether this person already has an intake waiting for a
  // counselor, so the UI can explain the flow instead of silently duplicating it.
  const { rows: existing } = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*)::text AS count FROM employee_counseling_submissions
      WHERE tenant_id = $1 AND employee_user_id = $2
        AND deleted_at IS NULL
        AND submission_status IN ('submitted', 'in_progress')`,
    [tenantId, staff.user_id],
  );

  return {
    valid: true,
    staff_name: staff.full_name,
    gender: staff.gender ?? undefined,
    // No phone column on `users`, so contact is typed by the employee.
    email: staff.email ?? undefined,
    has_open_intake: parseInt(existing[0]?.count ?? '0', 10) > 0,
  };
}

interface SlotRow {
  slot_id: string;
  professional_id: string;
  slot_start: Date;
  slot_end: Date;
  is_available: boolean;
}

/**
 * Run the whole combined intake.
 *
 * Steps: verify NIK → re-check the slot is free → book the appointment → insert
 * the intake linked to it → notify the counselor. Any failure after the slot has
 * been taken releases it again.
 */
export async function submitCombinedIntake(
  tenantId: string,
  data: CombinedIntakeInput,
): Promise<CombinedIntakeResult> {
  // ── 1. Identity ────────────────────────────────────────────────────────────
  const staff = await findStaffByNik(tenantId, data.nik);
  if (!staff) {
    throw new ValidationError('NIK tidak terdaftar sebagai staff aktif.');
  }

  // ── 2. Slot availability (re-read; the page may be stale) ──────────────────
  const { rows: slots } = await queryWithTenant<SlotRow>(
    tenantId,
    `SELECT slot_id, professional_id, slot_start, slot_end, is_available
       FROM availability_slots
      WHERE tenant_id = $1 AND slot_id = $2 AND deleted_at IS NULL`,
    [tenantId, data.slot_id],
  );
  const slot = slots[0];
  if (!slot) throw new NotFoundError('Slot', data.slot_id);
  if (!slot.is_available) {
    throw new ConflictError('Slot sudah dibooking oleh orang lain. Silakan pilih jadwal lain.');
  }

  // ── 3. Gender rule: male staff may only see a male counselor ───────────────
  if (staff.gender?.toLowerCase() === 'male') {
    const { rows: c } = await queryWithTenant<{ gender: string | null }>(
      tenantId,
      `SELECT gender FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, slot.professional_id],
    );
    const counselorGender = c[0]?.gender;
    if (counselorGender !== null && counselorGender?.toLowerCase() !== 'male') {
      throw new ValidationError('Aturan: staff laki-laki hanya dapat memilih konselor laki-laki.');
    }
  }

  const isHighPriority = detectHighPriority(data.answers);

  // ── 4. Book the appointment ────────────────────────────────────────────────
  const appointment = await createAppointment(tenantId, {
    type: 'personal',
    created_by: staff.user_id,
    created_for: staff.user_id,
    counselor_id: slot.professional_id,
    location: 'offline',
    notes: `Pengajuan konseling (NIK terverifikasi) oleh ${staff.full_name}.`,
  });

  let booked = false;
  try {
    const confirmed = await confirmAppointment(
      tenantId,
      appointment.appointment_id,
      new Date(slot.slot_start).toISOString(),
      staff.user_id,
    );
    if (!confirmed) throw new Error('Gagal mengonfirmasi janji temu.');

    await updateAvailabilitySlot(tenantId, slot.slot_id, {
      is_available: false,
      appointment_id: appointment.appointment_id,
    });
    booked = true;

    // ── 5. Insert the intake, linked to the booking ──────────────────────────
    const { rows: inserted } = await queryWithTenant<{
      submission_id: string;
      scheduled_at: Date | null;
    }>(
      tenantId,
      `INSERT INTO employee_counseling_submissions
         (tenant_id, employee_name, unit, position, contact_number, answers, consents,
          is_high_priority, submitted_by, submission_status,
          booking_status, employee_user_id, nik_verified,
          appointment_id, scheduled_at, slot_start, slot_end,
          assigned_counselor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted',
               'combined', $9, true,
               $10, $11, $12, $13, $14)
       RETURNING submission_id, scheduled_at`,
      [
        tenantId,
        // Prefer the record's name over whatever was typed into the form.
        staff.full_name,
        data.unit ?? null,
        data.position ?? null,
        data.contact_number ?? null,
        JSON.stringify(data.answers),
        JSON.stringify(data.consents),
        isHighPriority,
        staff.user_id,
        appointment.appointment_id,
        confirmed.scheduled_at ?? new Date(slot.slot_start),
        new Date(slot.slot_start),
        new Date(slot.slot_end),
        slot.professional_id,
      ],
    );
    const submission = inserted[0]!;

    await auditLog({
      action: 'EMPLOYEE_COUNSELING_COMBINED_SUBMIT',
      entityType: 'employee_counseling_submissions',
      entityId: submission.submission_id,
      after: {
        appointment_id: appointment.appointment_id,
        counselor_id: slot.professional_id,
        is_high_priority: isHighPriority,
        nik_verified: true,
      } as unknown as Record<string, unknown>,
      tenantId,
      actorId: staff.user_id,
    });

    // ── 6. Notify the counselor ──────────────────────────────────────────────
    const { rows: cn } = await queryWithTenant<{ full_name: string }>(
      tenantId,
      `SELECT full_name FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, slot.professional_id],
    );
    const counselorName = cn[0]?.full_name ?? 'Konselor';
    const when = new Date(slot.slot_start).toLocaleString('id-ID');
    try {
      // In-app notifikasi (spec notifikasi): konselor penerima booking
      // mendapat "permintaan konseling", admin mendapat "konseling karyawan
      // baru". Best-effort — booking itu sendiri sudah sukses.
      await createNotification(tenantId, {
        user_id: slot.professional_id,
        type: 'COUNSELING_REQUEST',
        title: isHighPriority ? 'Pengajuan konseling mendesak' : 'Permintaan konseling karyawan',
        body: isHighPriority
          ? `${staff.full_name} mengisi pengajuan dengan tanda PRIORITAS TINGGI. Jadwal: ${when}.`
          : `${staff.full_name} mengisi pengajuan dan membooking jadwal ${when}.`,
      });
      await notifyRoles(tenantId, ADMIN_ROLES, {
        type: 'COUNSELING_REQUEST',
        title: 'Konseling karyawan baru',
        body: isHighPriority
          ? `${staff.full_name} — PRIORITAS TINGGI. Jadwal: ${when}.`
          : `${staff.full_name} mengisi pengajuan konseling. Jadwal: ${when}.`,
        link: '/dashboard/admin/employee-counseling',
      });
    } catch {
      /* non-fatal — the booking itself succeeded */
    }

    return {
      submission_id: submission.submission_id,
      appointment_id: appointment.appointment_id,
      counselor_id: slot.professional_id,
      counselor_name: counselorName,
      scheduled_at: new Date(confirmed.scheduled_at ?? slot.slot_start).toISOString(),
      is_high_priority: isHighPriority,
      booking_status: 'combined',
    };
  } catch (err) {
    // Compensate: the appointment exists and the slot is consumed, but the
    // intake does not. Leave the counselor's calendar exactly as we found it.
    if (booked) {
      await compensateFailedBooking(tenantId, appointment.appointment_id, slot.slot_id);
    }
    throw err;
  }
}

/**
 * Undo a partial booking. Best-effort on purpose — the caller is already throwing
 * the original error, and swallowing a cleanup failure is better than masking
 * the real problem the employee needs to see.
 */
async function compensateFailedBooking(
  tenantId: string,
  appointmentId: string,
  slotId: string,
): Promise<void> {
  try {
    await queryWithTenant(
      tenantId,
      `UPDATE appointments SET status = 'cancelled', deleted_at = now()
        WHERE tenant_id = $1 AND appointment_id = $2 AND deleted_at IS NULL`,
      [tenantId, appointmentId],
    );
    await updateAvailabilitySlot(tenantId, slotId, {
      is_available: true,
      appointment_id: null,
    });
  } catch (cleanupErr) {
    console.error('[employee-counseling] booking compensation failed:', cleanupErr);
  }
}