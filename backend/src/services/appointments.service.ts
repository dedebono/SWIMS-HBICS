import { queryWithTenant } from '../db/pool.js';
import type { AppointmentRow, AvailabilitySlotRow } from '@swims/shared';
import { auditLog } from '../utils/audit-log.js';
import { sendWhatsAppMessage } from './notifications.service.js';

export async function listAppointments(tenantId: string, filters?: {
  created_for?: string;
  counselor_id?: string;
  psychologist_id?: string;
  status?: string;
  type?: 'student' | 'personal';
}): Promise<AppointmentRow[]> {
  let sql = `SELECT * FROM appointments WHERE tenant_id = $1 AND deleted_at IS NULL`;
  const params: unknown[] = [tenantId];
  let p = 2;

  if (filters?.created_for) { sql += ` AND created_for = $${p++}`; params.push(filters.created_for); }
  if (filters?.counselor_id) { sql += ` AND counselor_id = $${p++}`; params.push(filters.counselor_id); }
  if (filters?.psychologist_id) { sql += ` AND psychologist_id = $${p++}`; params.push(filters.psychologist_id); }
  if (filters?.status) { sql += ` AND status = $${p++}`; params.push(filters.status); }
  if (filters?.type) { sql += ` AND type = $${p++}`; params.push(filters.type); }

  sql += ` ORDER BY created_at DESC LIMIT 100`;

  const { rows } = await queryWithTenant<AppointmentRow>(tenantId, sql, params);
  return rows;
}

export async function getAppointment(tenantId: string, appointmentId: string): Promise<AppointmentRow | null> {
  const { rows } = await queryWithTenant<AppointmentRow>(
    tenantId,
    `SELECT * FROM appointments WHERE tenant_id = $1 AND appointment_id = $2 AND deleted_at IS NULL`,
    [tenantId, appointmentId],
  );
  return rows[0] ?? null;
}

export async function createAppointment(tenantId: string, data: {
  type: 'student' | 'personal';
  created_by: string;
  created_for: string;
  student_id?: string;
  counselor_id?: string;
  psychologist_id?: string;
  school_nurse_id?: string;
  location?: 'online' | 'offline';
  notes?: string;
}): Promise<AppointmentRow> {
  const { rows } = await queryWithTenant<AppointmentRow>(
    tenantId,
    `INSERT INTO appointments (tenant_id, type, created_by, created_for, student_id, counselor_id, psychologist_id, school_nurse_id, location, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [tenantId, data.type, data.created_by, data.created_for, data.student_id ?? null, data.counselor_id ?? null, data.psychologist_id ?? null, data.school_nurse_id ?? null, data.location ?? null, data.notes ?? null],
  );
  const appointment = rows[0]!;
  await auditLog({
    action: 'APPOINTMENT_CREATED',
    entityType: 'appointments',
    entityId: appointment.appointment_id,
    after: appointment as unknown as Record<string, unknown>,
    tenantId,
    actorId: data.created_by,
  });
  return appointment;
}

export async function updateAppointmentStatus(tenantId: string, appointmentId: string, status: AppointmentRow['status'], actorId: string, notes?: string): Promise<AppointmentRow | null> {
  const { rows } = await queryWithTenant<AppointmentRow>(
    tenantId,
    `UPDATE appointments SET status = $1, notes = COALESCE($2, notes), updated_at = now() WHERE tenant_id = $3 AND appointment_id = $4 AND deleted_at IS NULL RETURNING *`,
    [status, notes ?? null, tenantId, appointmentId],
  );
  const updated = rows[0] ?? null;
  if (updated) {
    await auditLog({
      action: 'APPOINTMENT_STATUS_UPDATED',
      entityType: 'appointments',
      entityId: appointmentId,
      after: updated as unknown as Record<string, unknown>,
      tenantId,
      actorId,
    });
  }
  return updated;
}

export async function confirmAppointment(tenantId: string, appointmentId: string, scheduled_at: string, actorId: string): Promise<AppointmentRow | null> {
  const { rows } = await queryWithTenant<AppointmentRow>(
    tenantId,
    `UPDATE appointments SET status = 'confirmed', scheduled_at = $1, updated_at = now() WHERE tenant_id = $2 AND appointment_id = $3 AND deleted_at IS NULL RETURNING *`,
    [scheduled_at, tenantId, appointmentId],
  );
  const updated = rows[0] ?? null;
  if (updated) {
    await auditLog({
      action: 'APPOINTMENT_CONFIRMED',
      entityType: 'appointments',
      entityId: appointmentId,
      after: updated as unknown as Record<string, unknown>,
      tenantId,
      actorId,
    });

    // Send WhatsApp notification if a student is linked and has a phone number
    if (updated.type === 'student' && updated.student_id) {
      const student = await queryWithTenant<{ phone_number: string | null; full_name: string }>(
        tenantId,
        `SELECT phone_number, full_name FROM students WHERE student_id = $1`,
        [updated.student_id]
      );
      const studentPhoneNumber = student.rows[0]?.phone_number;
      const studentFullName = student.rows[0]?.full_name;

      if (studentPhoneNumber && studentFullName) {
        const message = `Halo ${studentFullName}, janji temu Anda telah dikonfirmasi pada ${new Date(scheduled_at).toLocaleString('id-ID')}.`;
        await sendWhatsAppMessage(tenantId, { chatId: studentPhoneNumber, text: message });
      }
    }
  }
  return updated;
}

export async function listAvailability(tenantId: string, professionalId: string): Promise<AvailabilitySlotRow[]> {
  const { rows } = await queryWithTenant<AvailabilitySlotRow>(
    tenantId,
    `SELECT * FROM availability_slots WHERE tenant_id = $1 AND professional_id = $2 AND deleted_at IS NULL ORDER BY slot_start ASC`,
    [tenantId, professionalId],
  );
  return rows;
}

export async function createAvailabilitySlot(tenantId: string, data: {
  professional_id: string;
  slot_start: string;
  slot_end: string;
  is_available?: boolean;
}): Promise<AvailabilitySlotRow> {
  const { rows } = await queryWithTenant<AvailabilitySlotRow>(
    tenantId,
    `INSERT INTO availability_slots (tenant_id, professional_id, slot_start, slot_end, is_available)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tenantId, data.professional_id, data.slot_start, data.slot_end, data.is_available ?? true],
  );
  return rows[0]!;
}

export async function updateAvailabilitySlot(tenantId: string, slotId: string, data: {
  slot_start?: string;
  slot_end?: string;
  is_available?: boolean;
  appointment_id?: string | null;
}): Promise<AvailabilitySlotRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.slot_start !== undefined) { setClauses.push(`slot_start = $${idx++}`); values.push(data.slot_start); }
  if (data.slot_end !== undefined) { setClauses.push(`slot_end = $${idx++}`); values.push(data.slot_end); }
  if (data.is_available !== undefined) { setClauses.push(`is_available = $${idx++}`); values.push(data.is_available); }
  if (data.appointment_id !== undefined) { setClauses.push(`appointment_id = $${idx++}`); values.push(data.appointment_id); }
  setClauses.push(`updated_at = now()`);

  values.push(tenantId, slotId);
  const { rows } = await queryWithTenant<AvailabilitySlotRow>(
    tenantId,
    `UPDATE availability_slots SET ${setClauses.join(', ')} WHERE tenant_id = $${idx++} AND slot_id = $${idx++} AND deleted_at IS NULL RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

// Create appointment for personal staff -> counselor with gender rule
export async function createPersonalAppointment(
  tenantId: string,
  data: {
    created_for: string;
    counselor_id?: string;
    location?: 'online' | 'offline';
    notes?: string;
    actor_id: string;
  },
): Promise<{ appointment: AppointmentRow; matched_counselor_id: string }> {
  let counselorId = data.counselor_id || null;

  if (!counselorId) {
    const { rows } = await queryWithTenant<{ user_id: string; gender: string }>(
      tenantId,
      `SELECT user_id, gender FROM users WHERE tenant_id = $1 AND role = 'COUNSELOR' AND is_active = true ORDER BY created_at ASC LIMIT 1`,
      [tenantId],
    );
    counselorId = rows[0]?.user_id ?? null;
  } else {
    const { rows } = await queryWithTenant<{ gender: string }>(
      tenantId,
      `SELECT gender FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, counselorId],
    );
    const counselorGender = rows[0]?.gender ?? '';
    
    // If we need actor gender, fetch it from users table using actor_id
    const { rows: actorRows } = await queryWithTenant<{ gender: string }>(
      tenantId,
      `SELECT gender FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, data.actor_id],
    );
    const actorGender = actorRows[0]?.gender ?? '';
    const isMale = actorGender.toLowerCase() === 'male';
    if (isMale && counselorGender.toLowerCase() !== 'male') {
      throw new Error('Gender rule: male personal staff can only book male counselor');
    }
  }

  if (!counselorId) {
    throw new Error('No counselor available');
  }

  const { rows } = await queryWithTenant<AppointmentRow>(
    tenantId,
    `INSERT INTO appointments (tenant_id, type, status, created_by, created_for, counselor_id, location, notes)
     VALUES ($1, 'personal', 'pending', $2, $3, $4, $5, $6) RETURNING *`,
    [tenantId, data.actor_id, data.created_for, counselorId, data.location ?? null, data.notes ?? null],
  );
  return { appointment: rows[0]!, matched_counselor_id: counselorId };
}

export async function updateAppointmentNotes(
  tenantId: string,
  appointmentId: string,
  actorId: string,
  notes: string,
): Promise<AppointmentRow | null> {
  const { rows } = await queryWithTenant<AppointmentRow>(
    tenantId,
    `UPDATE appointments SET notes = $1 WHERE appointment_id = $2 AND tenant_id = $3 RETURNING *`,
    [notes, appointmentId, tenantId],
  );
  const updated = rows[0] ?? null;
  if (updated) {
    await auditLog({
      action: 'APPOINTMENT_NOTES_UPDATED',
      entityType: 'appointments',
      entityId: appointmentId,
      after: updated as unknown as Record<string, unknown>,
      tenantId,
      actorId,
    });
  }
  return updated;
}

// Nurse mediation: update status/location/scheduled_at while sending notification placeholder
export async function mediateAppointment(
  tenantId: string,
  appointmentId: string,
  actorId: string,
  data: {
    status?: AppointmentRow['status'];
    scheduled_at?: string | null;
    location?: 'online' | 'offline' | null;
    notes?: string | null;
  },
): Promise<AppointmentRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 2;

  if (data.status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(data.status); }
  if (data.scheduled_at !== undefined) { setClauses.push(`scheduled_at = $${idx++}`); values.push(data.scheduled_at); }
  if (data.location !== undefined) { setClauses.push(`location = $${idx++}`); values.push(data.location); }
  if (data.notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(data.notes); }
  setClauses.push(`updated_at = now()`);

  values.push(tenantId, appointmentId);
  const { rows } = await queryWithTenant<AppointmentRow>(
    tenantId,
    `UPDATE appointments SET ${setClauses.join(', ')} WHERE tenant_id = $${idx++} AND appointment_id = $${idx++} AND deleted_at IS NULL RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}
