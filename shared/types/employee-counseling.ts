// ─── Employee Counseling — Types & Zod Schemas ────────────────────────────────
// Source: update_instruction_questions.json (CONFIDENTIALITY: HIGH)

import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const EmployeeCounselingSubmissionStatus = {
  SUBMITTED: 'submitted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CLOSED: 'closed',
} as const;
export type EmployeeCounselingSubmissionStatus =
  (typeof EmployeeCounselingSubmissionStatus)[keyof typeof EmployeeCounselingSubmissionStatus];

export const EmployeeCounselingRiskLevel = {
  NO_RISK: 'no_risk',
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
} as const;
export type EmployeeCounselingRiskLevel =
  (typeof EmployeeCounselingRiskLevel)[keyof typeof EmployeeCounselingRiskLevel];

export const EmployeeCounselingSessionMethod = {
  TATAP_MUKA: 'tatap_muka',
  ONLINE: 'online',
} as const;
export type EmployeeCounselingSessionMethod =
  (typeof EmployeeCounselingSessionMethod)[keyof typeof EmployeeCounselingSessionMethod];

export const EmployeeCounselingFollowUpStatus = {
  SELESAI: 'selesai',
  FOLLOW_UP_DISAARANKAN: 'follow_up_disarankan',
  FOLLOW_UP_DIJADWALKAN: 'follow_up_dijadwalkan',
  REFERRAL_DIREKOMENDASIKAN: 'referral_direkomendasikan',
  REFERRAL_DILAKUKAN: 'referral_dilakukan',
} as const;
export type EmployeeCounselingFollowUpStatus =
  (typeof EmployeeCounselingFollowUpStatus)[keyof typeof EmployeeCounselingFollowUpStatus];

export const EmployeeCounselingSafetyAction = {
  TIDAK_DIBUTUHKAN: 'tidak_dibutuhkan',
  SAFETY_PLAN: 'safety_plan',
  EMERGENCY_PROTOCOL: 'emergency_protocol',
  REFERRAL_PROFESIONAL: 'referral_profesional',
  EMERGENCY_REFERRAL: 'emergency_referral',
} as const;
export type EmployeeCounselingSafetyAction =
  (typeof EmployeeCounselingSafetyAction)[keyof typeof EmployeeCounselingSafetyAction];

// ─── Row Types ──────────────────────────────────────────────────────────────

export interface EmployeeCounselingSubmissionRow {
  submission_id: string;
  tenant_id: string;
  employee_name: string;
  unit: string | null;
  position: string | null;
  contact_number: string | null;
  answers: EmployeeCounselingAnswers;
  consents: EmployeeCounselingConsents;
  is_high_priority: boolean;
  submission_status: EmployeeCounselingSubmissionStatus;
  submitted_by: string | null;
  assigned_counselor_id: string | null;
  submitted_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EmployeeCounselingSubmissionWithCounselor
  extends EmployeeCounselingSubmissionRow {
  counselor_name: string | null;
  submitted_by_name: string | null;
}

export interface EmployeeCounselingSessionRow {
  session_id: string;
  tenant_id: string;
  submission_id: string;
  session_number: number;
  session_date: string | null;
  session_time: string | null;
  method: EmployeeCounselingSessionMethod | null;
  section_1_info: SessionSection1Info;
  section_2_presenting_concern: string | null;
  section_3_key_points: string[];
  section_4_observation: string | null;
  section_5_intervention: SessionSection5Intervention;
  section_6_employee_insight: string | null;
  section_7_action_plan: string[];
  section_8_risk: SessionSection8Risk;
  section_9_followup: SessionSection9FollowUp;
  section_10_closure: SessionSection10Closure | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EmployeeCounselingAccessLogRow {
  log_id: string;
  tenant_id: string;
  submission_id: string;
  accessed_by: string;
  accessed_at: string;
  access_reason: string | null;
}

export interface EmployeeCounselingAccessLogWithUser extends EmployeeCounselingAccessLogRow {
  accessed_by_name: string;
}

// ─── Answer Schemas (from JSON intake form) ──────────────────────────────────

export interface EmployeeCounselingAnswers {
  // Section B: Kebutuhan Konseling
  q1_alasan: string[];           // checkbox_group — alasan utama
  q2_deskripsi: string;           // text_area — cerita singkat
  q3_durasi: string;              // checkbox_group — durasi situasi
  q4_dampak: number;              // radio_group — 1-5
  q5_area_terdampak: string[];    // checkbox_group — area terdampak

  // Section C: Hararan Konseling
  q6_harapan: string[];           // checkbox_group — harapan
  q7_pernah_konseling: 'belum_pernah' | 'pernah' | 'sedang_dalam_pendampingan';
  q7_pernah_konseling_detail?: string; // follow-up text_area

  // Section D: Kondisi Mendesak
  q8_safety_threat: 'tidak' | 'ya' | 'tidak_yakin';
  q9_bantuan_segera: 'tidak' | 'ya' | 'tidak_yakin';

  // Section E: Jadwal
  e_waktu: string[];              // checkbox_group — sebelum/jamkerja/setelah
  e_hari: string;                 // text — hari diutamakan
  e_metode: 'tatap_muka' | 'online' | 'tanpa_preferensi';
  e_konselor_preferensi: 'tanpa_preferensi' | 'konselor_pria' | 'konselor_wanita';
}

export interface EmployeeCounselingConsents {
  consent_confidentiality: boolean;
  consent_emergency_protocol: boolean;
}

// ─── Session Note Schemas ────────────────────────────────────────────────────

export interface SessionSection1Info {
  employee_name: string;
  counselor_name: string;
  session_date: string;
  session_time: string;
  method: EmployeeCounselingSessionMethod;
}

export interface SessionSection5Intervention {
  type: string;                   // e.g. 'Active listening', 'Problem solving', etc.
  note: string;
}

export interface SessionSection8Risk {
  level: EmployeeCounselingRiskLevel;
  concern_description: string;
  safety_action: EmployeeCounselingSafetyAction;
}

export interface SessionSection9FollowUp {
  status: EmployeeCounselingFollowUpStatus;
  target_sesi_berikutnya: string;
  tanggal_follow_up: string | null;
}

export interface SessionSection10Closure {
  reason: string;
  summary: string;
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

export const EmployeeCounselingSubmissionSchema = z.object({
  employee_name: z.string().min(1),
  // These are NULLABLE columns in the DB (migration 044: `unit TEXT` with no
  // NOT NULL) and submitIntake() explicitly persists `data.unit ?? null`.
  // `z.string().optional()` accepts `undefined` but REJECTS `null`, so a client
  // that omits the field by sending `null` got 422 "Expected string, received
  // null". `.nullish()` accepts both, matching the storage contract.
  unit: z.string().nullish(),
  position: z.string().nullish(),
  contact_number: z.string().nullish(),
  answers: z.object({
    q1_alasan: z.array(z.string()).min(1),
    // Same reasoning: optional free-text fields are stored inside the answers
    // JSONB blob, where an absent key and an explicit null mean the same thing.
    q2_deskripsi: z.string().nullish(),
    q3_durasi: z.string(),
    q4_dampak: z.number().int().min(1).max(5),
    q5_area_terdampak: z.array(z.string()),
    q6_harapan: z.array(z.string()),
    q7_pernah_konseling: z.enum(['belum_pernah', 'pernah', 'sedang_dalam_pendampingan']),
    q7_pernah_konseling_detail: z.string().nullish(),
    q8_safety_threat: z.enum(['tidak', 'ya', 'tidak_yakin']),
    q9_bantuan_segera: z.enum(['tidak', 'ya', 'tidak_yakin']),
    e_waktu: z.array(z.string()),
    e_hari: z.string().nullish(),
    e_metode: z.enum(['tatap_muka', 'online', 'tanpa_preferensi']),
    e_konselor_preferensi: z.enum(['tanpa_preferensi', 'konselor_pria', 'konselor_wanita']),
  }),
  consents: z.object({
    consent_confidentiality: z.literal(true),
    consent_emergency_protocol: z.literal(true),
  }),
});

export const CreateSessionNoteSchema = z.object({
  submission_id: z.string().uuid(),
  session_number: z.number().int().min(1),
  session_date: z.string().optional(),
  session_time: z.string().optional(),
  method: z.enum(['tatap_muka', 'online']).optional(),
  section_1_info: z.object({
    employee_name: z.string(),
    counselor_name: z.string(),
    session_date: z.string(),
    session_time: z.string(),
    method: z.enum(['tatap_muka', 'online']),
  }),
  section_2_presenting_concern: z.string().optional(),
  section_3_key_points: z.array(z.string()),
  section_4_observation: z.string().optional(),
  section_5_intervention: z.object({
    type: z.string(),
    note: z.string(),
  }),
  section_6_employee_insight: z.string().optional(),
  section_7_action_plan: z.array(z.string()),
  section_8_risk: z.object({
    level: z.enum(['no_risk', 'low', 'moderate', 'high']),
    concern_description: z.string(),
    safety_action: z.enum([
      'tidak_dibutuhkan',
      'safety_plan',
      'emergency_protocol',
      'referral_profesional',
      'emergency_referral',
    ]),
  }),
  section_9_followup: z.object({
    status: z.enum([
      'selesai',
      'follow_up_disarankan',
      'follow_up_dijadwalkan',
      'referral_direkomendasikan',
      'referral_dilakukan',
    ]),
    target_sesi_berikutnya: z.string(),
    tanggal_follow_up: z.string().optional(),
  }),
  section_10_closure: z
    .object({
      reason: z.string(),
      summary: z.string(),
    })
    .optional(),
});

export const CloseSubmissionSchema = z.object({
  closure: z.object({
    reason: z.string(),
    summary: z.string(),
  }),
});

export const AssignCounselorSchema = z.object({
  counselor_id: z.string().uuid().nullable(),
});

export type CreateSubmissionInput = z.infer<typeof EmployeeCounselingSubmissionSchema>;
export type CreateSessionNoteInput = z.infer<typeof CreateSessionNoteSchema>;
export type CloseSubmissionInput = z.infer<typeof CloseSubmissionSchema>;
export type AssignCounselorInput = z.infer<typeof AssignCounselorSchema>;
