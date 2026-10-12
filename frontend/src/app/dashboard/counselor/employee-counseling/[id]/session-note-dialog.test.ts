import { describe, it, expect } from 'vitest';

/**
 * The session-note modal doubles as a "reopen" viewer: clicking a row in the
 * Catatan Sesi table passes the saved session in, and the form must prefill
 * from every stored section instead of resetting to blanks.
 *
 * This mirrors `formFromSession()` in session-note-dialog.tsx.
 */

interface EditableSession {
  session_id: string;
  session_number: number;
  session_date?: string | null;
  session_time?: string | null;
  method?: string | null;
  section_2_presenting_concern?: string | null;
  section_3_key_points?: string[] | null;
  section_4_observation?: string | null;
  section_5_intervention?: { type?: string; note?: string } | null;
  section_6_employee_insight?: string | null;
  section_7_action_plan?: string[] | null;
  section_8_risk?: { level?: string; concern_description?: string; safety_action?: string } | null;
  section_9_followup?: {
    status?: string;
    target_sesi_berikutnya?: string;
    tanggal_follow_up?: string | null;
  } | null;
}

const INTERVENTION_OPTIONS = ['Active listening', 'Clarifying', 'Reflection'];

const toDateInput = (v?: string | null): string => (v ? String(v).slice(0, 10) : '');
const toTimeInput = (v?: string | null): string => (v ? String(v).slice(0, 5) : '');

function formFromSession(s: EditableSession) {
  return {
    session_date: toDateInput(s.session_date),
    session_time: toTimeInput(s.session_time),
    method: s.method === 'online' ? 'online' : 'tatap_muka',
    section_2_presenting_concern: s.section_2_presenting_concern ?? '',
    section_3_key_points: Array.isArray(s.section_3_key_points) ? [...s.section_3_key_points] : [],
    section_4_observation: s.section_4_observation ?? '',
    intervention_type: s.section_5_intervention?.type || INTERVENTION_OPTIONS[0],
    intervention_note: s.section_5_intervention?.note ?? '',
    section_6_employee_insight: s.section_6_employee_insight ?? '',
    section_7_action_plan: Array.isArray(s.section_7_action_plan) ? [...s.section_7_action_plan] : [],
    risk_level: s.section_8_risk?.level || 'no_risk',
    risk_description: s.section_8_risk?.concern_description ?? '',
    safety_action: s.section_8_risk?.safety_action || 'tidak_dibutuhkan',
    followup_status: s.section_9_followup?.status || 'follow_up_dijadwalkan',
    followup_target: s.section_9_followup?.target_sesi_berikutnya ?? '',
    followup_date: toDateInput(s.section_9_followup?.tanggal_follow_up),
  };
}

const savedSession: EditableSession = {
  session_id: 'aaaaaaaa-1111-2222-3333-444444444444',
  session_number: 3,
  session_date: '2026-10-12T00:00:00.000Z',
  session_time: '10:30:00',
  method: 'online',
  section_2_presenting_concern: 'KelUHatan kerja meningkat.',
  section_3_key_points: ['Beban kerja naik', 'Sulit tidur'],
  section_4_observation: 'Tampak kelelahan.',
  section_5_intervention: { type: 'Clarifying', note: 'Diberi ruang STORY' },
  section_6_employee_insight: 'Merasa tidak dihargai.',
  section_7_action_plan: ['Evaluasi beban kerja mingguan'],
  section_8_risk: {
    level: 'moderate',
    concern_description: 'Kelelahan kerja berkepanjangan.',
    safety_action: 'safety_plan',
  },
  section_9_followup: {
    status: 'follow_up_dijadwalkan',
    target_sesi_berikutnya: '2 minggu lagi',
    tanggal_follow_up: '2026-10-26T00:00:00.000Z',
  },
};

describe('session note modal prefill', () => {
  it('prefills every section from the reopened session', () => {
    const f = formFromSession(savedSession);

    expect(f.session_date).toBe('2026-10-12');
    expect(f.session_time).toBe('10:30');
    expect(f.method).toBe('online');
    expect(f.section_2_presenting_concern).toBe('KelUHatan kerja meningkat.');
    expect(f.section_3_key_points).toEqual(['Beban kerja naik', 'Sulit tidur']);
    expect(f.section_4_observation).toBe('Tampak kelelahan.');
    expect(f.intervention_type).toBe('Clarifying');
    expect(f.intervention_note).toBe('Diberi ruang STORY');
    expect(f.section_6_employee_insight).toBe('Merasa tidak dihargai.');
    expect(f.section_7_action_plan).toEqual(['Evaluasi beban kerja mingguan']);
    expect(f.risk_level).toBe('moderate');
    expect(f.risk_description).toBe('Kelelahan kerja berkepanjangan.');
    expect(f.safety_action).toBe('safety_plan');
    expect(f.followup_status).toBe('follow_up_dijadwalkan');
    expect(f.followup_target).toBe('2 minggu lagi');
    expect(f.followup_date).toBe('2026-10-26');
  });

  it('copies arrays instead of aliasing the source (edit must not mutate saved data)', () => {
    const f = formFromSession(savedSession);
    f.section_3_key_points.push('poin tambahan');
    f.section_7_action_plan.push('langkah tambahan');

    expect(savedSession.section_3_key_points).toHaveLength(2);
    expect(savedSession.section_7_action_plan).toHaveLength(1);
  });

  it('falls back to safe defaults for missing/null sections', () => {
    const sparse: EditableSession = {
      session_id: 'bbbbbbbb-1111-2222-3333-444444444444',
      session_number: 1,
      session_date: null,
      session_time: null,
      method: null,
      section_3_key_points: null,
      section_8_risk: null,
      section_9_followup: null,
    };
    const f = formFromSession(sparse);

    expect(f.session_date).toBe('');
    expect(f.session_time).toBe('');
    expect(f.method).toBe('tatap_muka');
    expect(f.section_3_key_points).toEqual([]);
    expect(f.risk_level).toBe('no_risk');
    expect(f.safety_action).toBe('tidak_dibutuhkan');
    expect(f.followup_status).toBe('follow_up_dijadwalkan');
  });
});