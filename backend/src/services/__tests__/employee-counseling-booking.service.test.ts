import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryWithTenant } from '../../db/pool.js';
import * as appointments from '../../services/appointments.service.js';
import * as notifications from '../../services/notifications.service.js';
import { auditLog } from '../../utils/audit-log.js';

// audit-log writes through a dedicated pool that is not mocked here.
vi.mock('../../utils/audit-log.js', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));
import { ValidationError, ConflictError, NotFoundError } from '../../utils/errors.js';
import * as service from '../employee-counseling-booking.service.js';
import type { CreateSubmissionInput } from '@swims/shared';

/**
 * The combined intake is the piece that must never leave a half-finished
 * booking behind: it consumes a scarce availability slot and writes two rows in
 * two different tables with no transaction available. These tests pin both the
 * happy path and the compensation path.
 */

const TENANT = 'tenant-123';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const COUNSELOR_ID = '22222222-2222-4222-8222-222222222222';
const SLOT_ID = '33333333-3333-4333-8333-333333333333';

const SLOT_START = new Date('2026-11-02T09:00:00Z');
const SLOT_END = new Date('2026-11-02T10:00:00Z');

const ANSWERS: CreateSubmissionInput['answers'] = {
  q1_alasan: ['stress'],
  q2_deskripsi: 'Merasa kewalahan',
  q3_durasi: '1_bulan',
  q4_dampak: 3,
  q5_area_terdampak: ['kerja'],
  q6_harapan: ['lebih_tenang'],
  q7_pernah_konseling: 'belum_pernah',
  q7_pernah_konseling_detail: '',
  q8_safety_threat: 'tidak',
  q9_bantuan_segera: 'tidak',
  e_waktu: ['pagi'],
  e_metode: 'tatap_muka',
  e_hari: 'senin',
  e_konselor_preferensi: 'tanpa_preferensi',
};

// The schema types the consent flags as literal `true` — they must be ticked.
const CONSENTS = { consent_confidentiality: true as const, consent_emergency_protocol: true as const };

const INPUT = {
  employee_name: 'Siti Aminah',
  unit: 'UnitSd',
  position: 'Guru',
  contact_number: '0812',
  answers: ANSWERS,
  consents: CONSENTS,
  nik: '1234567890123456',
  slot_id: SLOT_ID,
};

/** Route each SQL the service issues to a canned reply. */
function mockDb(opts: {
  staff?: Record<string, unknown> | null;
  slot?: Record<string, unknown> | null;
  counselorGender?: string | null;
  openIntakes?: number;
  insertThrows?: boolean;
} = {}) {
  // Only real `users` columns — there is no unit/position/contact_number there.
  const staff = opts.staff === undefined
    ? { user_id: STAFF_ID, full_name: 'Siti Aminah', gender: 'female', email: 's@x.sch.id' }
    : opts.staff;
  const slot = opts.slot === undefined
    ? { slot_id: SLOT_ID, professional_id: COUNSELOR_ID, slot_start: SLOT_START, slot_end: SLOT_END, is_available: true }
    : opts.slot;

  (queryWithTenant as any).mockImplementation(async (_t: string, sql: string, params: unknown[] = []) => {
    if (/FROM users[\s\S]*national_id_hash/.test(sql)) {
      return { rows: staff ? [staff] : [], rowCount: staff ? 1 : 0 };
    }
    if (/FROM availability_slots/.test(sql)) {
      return { rows: slot ? [slot] : [], rowCount: slot ? 1 : 0 };
    }
    if (/SELECT gender FROM users/.test(sql)) {
      return { rows: [{ gender: opts.counselorGender ?? null }], rowCount: 1 };
    }
    if (/SELECT full_name FROM users/.test(sql)) {
      return { rows: [{ full_name: 'Konselor Satu' }], rowCount: 1 };
    }
    if (/COUNT\(\*\)/.test(sql)) {
      return { rows: [{ count: String(opts.openIntakes ?? 0) }], rowCount: 1 };
    }
    if (/INSERT INTO employee_counseling_submissions/.test(sql)) {
      if (opts.insertThrows) throw new Error('insert exploded');
      return { rows: [{ submission_id: 'sub-1', scheduled_at: SLOT_START }], rowCount: 1 };
    }
    if (/UPDATE appointments/.test(sql)) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe('employee-counseling-booking.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(appointments, 'createAppointment').mockResolvedValue({
      appointment_id: 'appt-1',
    } as any);
    vi.spyOn(appointments, 'confirmAppointment').mockResolvedValue({
      appointment_id: 'appt-1',
      scheduled_at: SLOT_START,
    } as any);
    vi.spyOn(appointments, 'updateAvailabilitySlot').mockResolvedValue({} as any);
    vi.spyOn(notifications, 'createNotification').mockResolvedValue(null as any);
    vi.spyOn(notifications, 'notifyRoles').mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDb();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────
  describe('submitCombinedIntake', () => {
    it('creates the booking AND the linked intake in one call', async () => {
      const res = await service.submitCombinedIntake(TENANT, INPUT);

      expect(res.submission_id).toBe('sub-1');
      expect(res.appointment_id).toBe('appt-1');
      expect(res.counselor_id).toBe(COUNSELOR_ID);
      expect(res.booking_status).toBe('combined');
      expect(appointments.createAppointment).toHaveBeenCalledTimes(1);
      expect(appointments.confirmAppointment).toHaveBeenCalledTimes(1);
    });

    it('assigns the chosen counselor to the intake', async () => {
      await service.submitCombinedIntake(TENANT, INPUT);
      const sql = (queryWithTenant as any).mock.calls
        .map((c: any[]) => c[1] as string)
        .find((s: string) => /INSERT INTO employee_counseling_submissions/.test(s))!;
      expect(sql).toContain('assigned_counselor_id');
      // Counselor id must travel in the parameter list, not be inlined.
      expect((queryWithTenant as any).mock.calls.some((c: any[]) => c[2]?.includes(COUNSELOR_ID))).toBe(true);
    });

    it('links the intake to the appointment it booked', async () => {
      await service.submitCombinedIntake(TENANT, INPUT);
      const insert = (queryWithTenant as any).mock.calls.find((c: any[]) =>
        /INSERT INTO employee_counseling_submissions/.test(c[1]),
      )!;
      expect(insert[2]).toContain('appt-1');
    });

    it('records booking_status=combined and nik_verified=true', async () => {
      await service.submitCombinedIntake(TENANT, INPUT);
      const sql = (queryWithTenant as any).mock.calls
        .map((c: any[]) => c[1] as string)
        .find((s: string) => /INSERT INTO employee_counseling_submissions/.test(s))!;
      expect(sql).toContain("'combined'");
      expect(sql).toContain('true');
    });

    it('books the appointment FOR the resolved staff account', async () => {
      await service.submitCombinedIntake(TENANT, INPUT);
      expect(appointments.createAppointment).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          type: 'personal',
          created_for: STAFF_ID,
          counselor_id: COUNSELOR_ID,
        }),
      );
    });

    it('prefers the name on the staff record over what was typed in the form', async () => {
      mockDb({ staff: { user_id: STAFF_ID, full_name: 'Siti Aminah Resmi', gender: 'female', email: null, phone_number: null } });
      const res = await service.submitCombinedIntake(TENANT, { ...INPUT, employee_name: 'sitimin' });
      const insert = (queryWithTenant as any).mock.calls.find((c: any[]) =>
        /INSERT INTO employee_counseling_submissions/.test(c[1]),
      )!;
      expect(insert[2]).toContain('Siti Aminah Resmi');
      expect(res.submission_id).toBe('sub-1');
    });

    it('marks the slot as taken', async () => {
      await service.submitCombinedIntake(TENANT, INPUT);
      expect(appointments.updateAvailabilitySlot).toHaveBeenCalledWith(
        TENANT,
        SLOT_ID,
        { is_available: false, appointment_id: 'appt-1' },
      );
    });

    it('notifies the counselor', async () => {
      await service.submitCombinedIntake(TENANT, INPUT);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          user_id: COUNSELOR_ID,
          type: 'COUNSELING_REQUEST',
          title: expect.stringContaining('konseling'),
        }),
      );
    });

    it('writes an audit entry', async () => {
      await service.submitCombinedIntake(TENANT, INPUT);
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'EMPLOYEE_COUNSELING_COMBINED_SUBMIT',
        tenantId: TENANT,
      }));
    });
  });

  // ── High priority ──────────────────────────────────────────────────────────
  describe('high-priority detection', () => {
    it('flags an intake when safety threat = "ya"', async () => {
      const res = await service.submitCombinedIntake(TENANT, {
        ...INPUT,
        answers: { ...ANSWERS, q8_safety_threat: 'ya' },
      });
      expect(res.is_high_priority).toBe(true);
    });

    it('flags an intake when help needed = "tidak_yakin"', async () => {
      const res = await service.submitCombinedIntake(TENANT, {
        ...INPUT,
        answers: { ...ANSWERS, q9_bantuan_segera: 'tidak_yakin' },
      });
      expect(res.is_high_priority).toBe(true);
    });

    it('escalates the notification title for a high-priority intake', async () => {
      await service.submitCombinedIntake(TENANT, {
        ...INPUT,
        answers: { ...ANSWERS, q9_bantuan_segera: 'ya' },
      });
      expect(notifications.createNotification).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ user_id: COUNSELOR_ID, title: 'Pengajuan konseling mendesak' }),
      );
    });

    it('leaves a calm intake unflagged', async () => {
      const res = await service.submitCombinedIntake(TENANT, INPUT);
      expect(res.is_high_priority).toBe(false);
    });
  });

  // ── Identity ───────────────────────────────────────────────────────────────
  describe('NIK verification', () => {
    it('rejects an unknown NIK without touching any booking', async () => {
      mockDb({ staff: null });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).rejects.toThrow(ValidationError);
      expect(appointments.createAppointment).not.toHaveBeenCalled();
    });

    it('rejects an empty NIK', async () => {
      mockDb({ staff: null });
      await expect(service.submitCombinedIntake(TENANT, { ...INPUT, nik: '' })).rejects.toThrow(ValidationError);
    });
  });

  // ── Slot ───────────────────────────────────────────────────────────────────
  describe('slot validation', () => {
    it('404s on a slot that does not exist', async () => {
      mockDb({ slot: null });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).rejects.toThrow(NotFoundError);
      expect(appointments.createAppointment).not.toHaveBeenCalled();
    });

    it('409s when the slot was taken while the user was filling the form', async () => {
      // The page was loaded before someone else booked the same slot.
      mockDb({ slot: { slot_id: SLOT_ID, professional_id: COUNSELOR_ID, slot_start: SLOT_START, slot_end: SLOT_END, is_available: false } });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).rejects.toThrow(ConflictError);
      expect(appointments.createAppointment).not.toHaveBeenCalled();
    });
  });

  // ── Gender rule ────────────────────────────────────────────────────────────
  describe('male staff → male counselor rule', () => {
    it('rejects a male employee booking a female counselor', async () => {
      mockDb({ staff: { user_id: STAFF_ID, full_name: 'Budi', gender: 'male', email: null, phone_number: null }, counselorGender: 'female' });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).rejects.toThrow(/laki-laki/i);
      expect(appointments.createAppointment).not.toHaveBeenCalled();
    });

    it('allows a male employee booking a male counselor', async () => {
      mockDb({ staff: { user_id: STAFF_ID, full_name: 'Budi', gender: 'male', email: null, phone_number: null }, counselorGender: 'male' });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).resolves.toMatchObject({ submission_id: 'sub-1' });
    });

    it('allows any counselor when the staff gender is unknown', async () => {
      mockDb({ staff: { user_id: STAFF_ID, full_name: 'Budi', gender: null, email: null, phone_number: null }, counselorGender: 'female' });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).resolves.toMatchObject({ submission_id: 'sub-1' });
    });

    it('does not apply the rule to a female employee', async () => {
      mockDb({ counselorGender: 'male' });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).resolves.toMatchObject({ submission_id: 'sub-1' });
    });
  });

  // ── Compensation ───────────────────────────────────────────────────────────
  describe('consistency when the intake insert fails', () => {
    // No transaction spans appointments + submissions here, so a failure after
    // the slot was consumed would silently strand a booked appointment the
    // counselor never sees and the employee never gets a counseling record for.
    it('cancels the appointment and releases the slot', async () => {
      mockDb({ insertThrows: true });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).rejects.toThrow('insert exploded');

      const cancelSql = (queryWithTenant as any).mock.calls
        .map((c: any[]) => c[1] as string)
        .find((s: string) => /UPDATE appointments SET status = 'cancelled'/.test(s));
      expect(cancelSql).toBeDefined();

      expect(appointments.updateAvailabilitySlot).toHaveBeenLastCalledWith(
        TENANT,
        SLOT_ID,
        { is_available: true, appointment_id: null },
      );
    });

    it('still surfaces the original error, not the cleanup failure', async () => {
      mockDb({ insertThrows: true });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).rejects.toThrow('insert exploded');
    });

    it('does not cancel anything when the failure happened BEFORE booking', async () => {
      mockDb({ staff: null });
      await expect(service.submitCombinedIntake(TENANT, INPUT)).rejects.toThrow(ValidationError);
      const cancelSql = (queryWithTenant as any).mock.calls
        .map((c: any[]) => c[1] as string)
        .find((s: string) => /UPDATE appointments SET status = 'cancelled'/.test(s));
      expect(cancelSql).toBeUndefined();
    });

    it('does not fail the whole request when the counselor notification fails', async () => {
      vi.spyOn(notifications, 'createNotification').mockRejectedValue(new Error('redis down'));
      await expect(service.submitCombinedIntake(TENANT, INPUT)).resolves.toMatchObject({ submission_id: 'sub-1' });
    });
  });

  // ── verifyIdentityForCombined ──────────────────────────────────────────────
  describe('verifyIdentityForCombined', () => {
    it('returns the real record so the form can be pre-filled', async () => {
      const res = await service.verifyIdentityForCombined(TENANT, '1234567890123456');
      expect(res).toMatchObject({ valid: true, staff_name: 'Siti Aminah', email: 's@x.sch.id' });
    });

    it('reports an existing open intake so the page can explain itself', async () => {
      mockDb({ openIntakes: 2 });
      await expect(service.verifyIdentityForCombined(TENANT, '1234')).resolves.toMatchObject({
        has_open_intake: true,
      });
    });

    it('reports no open intake when the count is zero', async () => {
      mockDb({ openIntakes: 0 });
      await expect(service.verifyIdentityForCombined(TENANT, '1234')).resolves.toMatchObject({
        has_open_intake: false,
      });
    });

    it('returns invalid for a blank NIK without hitting the DB', async () => {
      await expect(service.verifyIdentityForCombined(TENANT, '  ')).resolves.toEqual({ valid: false });
    });

    it('returns invalid for an unregistered NIK', async () => {
      mockDb({ staff: null });
      await expect(service.verifyIdentityForCombined(TENANT, '9999')).resolves.toEqual({ valid: false });
    });

    it('never echoes the NIK back', async () => {
      const res = await service.verifyIdentityForCombined(TENANT, '1234567890123456');
      expect(JSON.stringify(res)).not.toContain('1234567890123456');
    });

    it('only selects columns that exist on `users`', async () => {
      // Regression: the first version asked for unit/position/contact_number,
      // none of which are `users` columns, so every identity check 500'd with
      // `column "contact_number" does not exist`.
      await service.verifyIdentityForCombined(TENANT, '1234567890123456');
      const sql = (queryWithTenant as any).mock.calls
        .map((c: any[]) => c[1] as string)
        .find((s: string) => /national_id_hash/.test(s))!;
      for (const missing of ['unit', 'position', 'contact_number', 'phone_number']) {
        expect(sql).not.toMatch(new RegExp(`\\\\b${missing}\\\\b`));
      }
      expect(sql).toContain('full_name');
    });
  });
});