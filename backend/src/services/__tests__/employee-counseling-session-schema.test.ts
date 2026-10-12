import { describe, it, expect } from 'vitest';
import { CreateSessionNoteSchema } from '@swims/shared';

/**
 * Regression: "Simpan sesi" on /dashboard/counselor/employee-counseling/[id]/session/new
 * failed 422 with "session_number: Required".
 *
 * Cause: CreateSessionNoteSchema declared session_number as REQUIRED, but the
 * frontend never sends it and createSession() derives it server-side via
 * COUNT(*)+1 per submission. Two sides disagreed on who owns the field.
 *
 * The payload below is copied verbatim from the shape the page actually POSTs.
 */
const pagePayload = {
  submission_id: '3f6b2a10-9c4d-4e1f-8a2b-5d7e9f0c1a2b',
  session_date: '2026-10-12',
  session_time: '10:30',
  method: 'tatap_muka' as const,
  section_1_info: {
    employee_name: '',
    counselor_name: 'Rina Hartati',
    session_date: '2026-10-12',
    session_time: '10:30',
    method: 'tatap_muka' as const,
  },
  section_2_presenting_concern: 'KelUHatan kerja meningkat akhir bulan ini.',
  section_3_key_points: ['Beban kerja naik', 'Sulit tidur'],
  section_4_observation: 'Tampak kelelahan.',
  section_5_intervention: { type: 'Mendengarkan aktif', note: 'Diberi ruang STORY' },
  section_6_employee_insight: 'Merasa tidak dihargai.',
  section_7_action_plan: ['Evaluasi beban kerja mingguan'],
  section_8_risk: {
    level: 'low' as const,
    concern_description: 'Kelelahan kerja.',
    safety_action: 'tidak_dibutuhkan' as const,
  },
  section_9_followup: {
    status: 'follow_up_dijadwalkan' as const,
    target_sesi_berikutnya: '2 minggu lagi',
    tanggal_follow_up: '2026-10-26',
  },
};

describe('CreateSessionNoteSchema — employee counseling session note', () => {
  it('accepts the exact payload the session form submits (no session_number)', () => {
    const parsed = CreateSessionNoteSchema.safeParse(pagePayload);
    if (!parsed.success) {
      // Surface the real field errors so a regression names the offending field.
      throw new Error(`expected parse to succeed, got: ${JSON.stringify(parsed.error.flatten())}`);
    }
    expect(parsed.data.submission_id).toBe(pagePayload.submission_id);
  });

  it('does not require session_number — the service owns numbering', () => {
    expect(pagePayload).not.toHaveProperty('session_number');
    expect(CreateSessionNoteSchema.safeParse(pagePayload).success).toBe(true);
  });

  it('still accepts an explicit session_number when one is sent', () => {
    const parsed = CreateSessionNoteSchema.safeParse({ ...pagePayload, session_number: 2 });
    expect(parsed.success).toBe(true);
  });

  it('still rejects an invalid session_number rather than ignoring the rule', () => {
    const parsed = CreateSessionNoteSchema.safeParse({ ...pagePayload, session_number: 0 });
    expect(parsed.success).toBe(false);
  });

  it('still enforces the required submission_id', () => {
    const parsed = CreateSessionNoteSchema.safeParse({ ...pagePayload, submission_id: undefined });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors).toHaveProperty('submission_id');
    }
  });

  it('accepts a closure section when present (optional passthrough)', () => {
    const parsed = CreateSessionNoteSchema.safeParse({
      ...pagePayload,
      section_10_closure: { reason: 'Selesai', summary: 'Kondisi membaik.' },
    });
    expect(parsed.success).toBe(true);
  });
});