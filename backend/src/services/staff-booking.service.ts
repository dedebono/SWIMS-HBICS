import { queryWithTenant } from '../db/pool.js';
import { hashNationalId } from '../utils/encryption.js';
import { createAppointment, confirmAppointment, updateAvailabilitySlot } from './appointments.service.js';
import { sendNotificationToUser } from './notifications.service.js';

export async function verifyNik(tenantId: string, nik: string): Promise<{ valid: boolean; staff_name?: string }> {
  if (!nik || !nik.trim()) return { valid: false };
  const hash = hashNationalId(nik);
  const { rows } = await queryWithTenant<{ user_id: string; full_name: string }>(
    tenantId,
    `SELECT user_id, full_name FROM users
     WHERE tenant_id = $1 AND national_id_hash = $2 AND role = 'PERSONAL' AND is_active = true`,
    [tenantId, hash],
  );
  return rows[0] ? { valid: true, staff_name: rows[0].full_name } : { valid: false };
}

export interface CounselorSlot {
  slot_id: string;
  slot_start: string;
  slot_end: string;
}

export interface CounselorWithSlots {
  user_id: string;
  full_name: string;
  gender: string;
  slots: CounselorSlot[];
}

/**
 * Public (no-login) helper for the QR booking flow.
 * Lists every active COUNSELOR together with their currently-available,
 * future-facing availability slots. The public page uses this to render
 * the counselor + schedule picker.
 */
export async function listCounselorAvailability(tenantId: string): Promise<CounselorWithSlots[]> {
  const { rows: counselors } = await queryWithTenant<{ user_id: string; full_name: string; gender: string }>(
    tenantId,
    `SELECT user_id, full_name, gender FROM users
     WHERE tenant_id = $1 AND role = 'COUNSELOR' AND is_active = true
     ORDER BY full_name ASC`,
    [tenantId],
  );

  const result: CounselorWithSlots[] = [];
  for (const c of counselors) {
    const { rows: slots } = await queryWithTenant<{ slot_id: string; slot_start: Date; slot_end: Date }>(
      tenantId,
      `SELECT slot_id, slot_start, slot_end FROM availability_slots
       WHERE tenant_id = $1 AND professional_id = $2 AND is_available = true AND deleted_at IS NULL AND slot_start >= now()
       ORDER BY slot_start ASC`,
      [tenantId, c.user_id],
    );
    result.push({
      user_id: c.user_id,
      full_name: c.full_name,
      gender: c.gender,
      slots: slots.map((s) => ({
        slot_id: s.slot_id,
        slot_start: new Date(s.slot_start).toISOString(),
        slot_end: new Date(s.slot_end).toISOString(),
      })),
    });
  }
  return result;
}

/**
 * Books a counseling appointment for a teacher/staff member identified only by
 * NIK (no login). Resolves the PERSONAL account by NIK hash, validates the
 * chosen availability slot, enforces the male-staff → male-counselor rule,
 * creates a confirmed personal appointment at the slot time, marks the slot
 * taken, and notifies the counselor (in-app, best-effort).
 */
export async function bookStaffCounseling(
  tenantId: string,
  data: { nik: string; full_name: string; gender: string; slot_id: string },
): Promise<{ appointment_id: string; counselor_id: string; scheduled_at: string }> {
  const hash = hashNationalId(data.nik);
  const { rows: staff } = await queryWithTenant<{ user_id: string; full_name: string; gender: string }>(
    tenantId,
    `SELECT user_id, full_name, gender FROM users
     WHERE tenant_id = $1 AND national_id_hash = $2 AND role = 'PERSONAL' AND is_active = true`,
    [tenantId, hash],
  );
  if (!staff[0]) {
    const err: any = new Error('NIK tidak terdaftar sebagai staff.');
    err.statusCode = 422;
    throw err;
  }
  const staffUser = staff[0]!;

  const { rows: slots } = await queryWithTenant<{
    slot_id: string;
    professional_id: string;
    slot_start: Date;
    slot_end: Date;
    is_available: boolean;
  }>(
    tenantId,
    `SELECT slot_id, professional_id, slot_start, slot_end, is_available
     FROM availability_slots
     WHERE tenant_id = $1 AND slot_id = $2 AND deleted_at IS NULL`,
    [tenantId, data.slot_id],
  );
  const slot = slots[0];
  if (!slot) {
    const err: any = new Error('Slot tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }
  if (!slot.is_available) {
    const err: any = new Error('Slot sudah dibooking oleh orang lain.');
    err.statusCode = 409;
    throw err;
  }

  // Gender rule: a male staff member may only book a male counselor.
  // Skip the check if the counselor's gender is not set (null).
  if (staffUser.gender.toLowerCase() === 'male') {
    const { rows: c } = await queryWithTenant<{ gender: string | null }>(
      tenantId,
      `SELECT gender FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, slot.professional_id],
    );
    const counselorGender = c[0]?.gender;
    if (counselorGender !== null && counselorGender.toLowerCase() !== 'male') {
      const err: any = new Error('Aturan: staff laki-laki hanya dapat memilih konselor laki-laki.');
      err.statusCode = 422;
      throw err;
    }
  }

  // Create the personal appointment, then confirm it at the slot time.
  const appointment = await createAppointment(tenantId, {
    type: 'personal',
    created_by: staffUser.user_id,
    created_for: staffUser.user_id,
    counselor_id: slot.professional_id,
    location: 'offline',
    notes: `Booking konseling via QR oleh ${data.full_name}.`,
  });
  const confirmed = await confirmAppointment(
    tenantId,
    appointment.appointment_id,
    new Date(slot.slot_start).toISOString(),
    staffUser.user_id,
  );
  if (!confirmed) {
    const err: any = new Error('Gagal mengonfirmasi janji temu.');
    err.statusCode = 500;
    throw err;
  }

  // Mark the slot as taken so it can't be double-booked.
  await updateAvailabilitySlot(tenantId, slot.slot_id, {
    is_available: false,
    appointment_id: appointment.appointment_id,
  });

  // Notify the counselor (in-app; best-effort, never throws).
  try {
    const { rows: cn } = await queryWithTenant<{ full_name: string }>(
      tenantId,
      `SELECT full_name FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, slot.professional_id],
    );
    await sendNotificationToUser(tenantId, slot.professional_id, {
      title: 'Janji Temu Konseling Baru',
      body: `Halo ${cn[0]?.full_name ?? 'Konselor'}, ${staffUser.full_name} telah membooking janji temu konseling pada ${new Date(slot.slot_start).toLocaleString('id-ID')}.`,
    });
  } catch {
    /* non-fatal */
  }

  return {
    appointment_id: confirmed.appointment_id,
    counselor_id: slot.professional_id,
    scheduled_at: confirmed.scheduled_at
      ? new Date(confirmed.scheduled_at).toISOString()
      : new Date(slot.slot_start).toISOString(),
  };
}
