import { queryWithTenant } from '../db/pool.js';
import type { AvailabilitySlotRow, RepeatPattern } from '@swims/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateSlotData {
  professional_id: string;
  slot_start: string;
  slot_end: string;
  is_available?: boolean;
  repeat_pattern?: RepeatPattern | null;
  repeat_day?: number | null;    // 0=Sun .. 6=Sat
  repeat_weeks?: number;          // 1 | 2 | 3 | 4  (every N weeks)
  repeat_count?: number;          // how many occurrences to generate (default 8)
}

export interface UpdateSlotData {
  slot_start?: string;
  slot_end?: string;
  is_available?: boolean;
  appointment_id?: string | null;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listAvailability(
  tenantId: string,
  professionalId: string,
): Promise<AvailabilitySlotRow[]> {
  const { rows } = await queryWithTenant<AvailabilitySlotRow>(
    tenantId,
    `SELECT * FROM availability_slots
     WHERE tenant_id = $1 AND professional_id = $2 AND deleted_at IS NULL
     ORDER BY slot_start ASC`,
    [tenantId, professionalId],
  );
  return rows;
}

// ─── Create single slot (no recurrence) ──────────────────────────────────────

export async function createAvailabilitySlot(
  tenantId: string,
  data: {
    professional_id: string;
    slot_start: string;
    slot_end: string;
    is_available?: boolean;
  },
): Promise<AvailabilitySlotRow> {
  const { rows } = await queryWithTenant<AvailabilitySlotRow>(
    tenantId,
    `INSERT INTO availability_slots (tenant_id, professional_id, slot_start, slot_end, is_available)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tenantId, data.professional_id, data.slot_start, data.slot_end, data.is_available ?? true],
  );
  return rows[0]!;
}

// ─── Create recurring slots ───────────────────────────────────────────────────

export async function createRecurringSlots(
  tenantId: string,
  data: CreateSlotData,
): Promise<AvailabilitySlotRow[]> {
  const {
    professional_id,
    slot_start,
    slot_end,
    is_available = true,
    repeat_pattern = 'weekly',
    repeat_day,
    repeat_weeks = 1,
    repeat_count = 8,
  } = data;

  // Parse the reference start datetime
  const startDate = new Date(slot_start);
  const endDate = new Date(slot_end);
  const durationMs = endDate.getTime() - startDate.getTime();

  // Determine the day-of-week of the reference start (0=Sun..6=Sat)
  const refDay = repeat_day ?? startDate.getDay();

  // The time portion for recurring slots
  const timeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;

  // Build occurrences
  const slots: AvailabilitySlotRow[] = [];
  let parentId: string | null = null;

  // Start from the given start date, walk forward until we have enough occurrences
  const current = new Date(startDate);
  let count = 0;

  while (count < repeat_count) {
    const dow = current.getDay();

    // For weekly: same day-of-week as reference start
    // For biweekly: same day-of-week, every N weeks
    let include = false;
    if (repeat_pattern === 'weekly') {
      include = dow === refDay;
    } else if (repeat_pattern === 'biweekly') {
      include = dow === refDay && (Math.floor((current.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) % repeat_weeks === 0);
    } else if (repeat_pattern === 'monthly') {
      // Same day-of-month as reference start
      include = current.getDate() === startDate.getDate();
    }

    if (include) {
      const occStart = new Date(current);
      const occEnd = new Date(occStart.getTime() + durationMs);

      const { rows } = await queryWithTenant<AvailabilitySlotRow>(
        tenantId,
        `INSERT INTO availability_slots
           (tenant_id, professional_id, slot_start, slot_end, is_available,
            repeat_pattern, repeat_day, repeat_time, parent_slot_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          tenantId,
          professional_id,
          occStart.toISOString(),
          occEnd.toISOString(),
          is_available,
          repeat_pattern,
          refDay,
          timeStr,
          parentId,
        ],
      );
      slots.push(rows[0]!);

      // First slot becomes the parent for subsequent instances
      if (parentId === null) parentId = rows[0]!.slot_id;

      count++;
    }

    // Advance by 1 day for next iteration
    current.setDate(current.getDate() + 1);
  }

  return slots;
}

// ─── Claim appointments waiting for a psychologist's availability ───────────
// A professional-path appointment is born `awaiting_psychologist_availability`
// with no psychologist_id, so it shows in NO ONE's dashboard. When any active
// professional publishes slots, claim those appointments: assign the slot
// owner as psychologist, replace the stale "Menunggu psikolog…" note, and let
// the route notify the teacher who submitted the questionnaire.
export async function claimAwaitingAppointments(
  tenantId: string,
  professionalId: string,
): Promise<Array<{ appointment_id: string; created_by: string | null }>> {
  const { rows } = await queryWithTenant<{ appointment_id: string; created_by: string | null }>(
    tenantId,
    `UPDATE appointments
       SET psychologist_id = $2,
           notes = 'Psikolog sudah mengisi ketersediaan jadwal — menunggu pemilihan slot & konfirmasi.',
           updated_at = now()
     WHERE tenant_id = $1 AND type = 'student'
       AND status = 'awaiting_psychologist_availability'
       AND deleted_at IS NULL
       AND (psychologist_id IS NULL OR psychologist_id = $2)
     RETURNING appointment_id, created_by`,
    [tenantId, professionalId],
  );
  return rows;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateAvailabilitySlot(
  tenantId: string,
  slotId: string,
  data: UpdateSlotData,
): Promise<AvailabilitySlotRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.slot_start !== undefined) {
    setClauses.push(`slot_start = $${idx++}`);
    values.push(data.slot_start);
  }
  if (data.slot_end !== undefined) {
    setClauses.push(`slot_end = $${idx++}`);
    values.push(data.slot_end);
  }
  if (data.is_available !== undefined) {
    setClauses.push(`is_available = $${idx++}`);
    values.push(data.is_available);
  }
  if (data.appointment_id !== undefined) {
    setClauses.push(`appointment_id = $${idx++}`);
    values.push(data.appointment_id);
  }
  setClauses.push(`updated_at = now()`);

  values.push(tenantId, slotId);
  const { rows } = await queryWithTenant<AvailabilitySlotRow>(
    tenantId,
    `UPDATE availability_slots
        SET ${setClauses.join(', ')}
      WHERE tenant_id = $${idx++} AND slot_id = $${idx++} AND deleted_at IS NULL
      RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteAvailabilitySlot(
  tenantId: string,
  slotId: string,
): Promise<boolean> {
  const { rows } = await queryWithTenant(
    tenantId,
    `UPDATE availability_slots SET deleted_at = now() WHERE tenant_id = $1 AND slot_id = $2 AND deleted_at IS NULL RETURNING slot_id`,
    [tenantId, slotId],
  );
  return rows.length > 0;
}
