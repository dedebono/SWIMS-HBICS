-- ============================================================================
-- SWIMS — 044: Employee Counseling (Employee Counseling Form & Counselor Recording)
-- Source: update_instruction_questions.json
-- Confidentiality: HIGH - Restricted Access
-- ============================================================================

-- ── Employee Counseling Submissions (Intake Form) ──────────────────────────────
CREATE TABLE employee_counseling_submissions (
  submission_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

  -- Section A: Basic Info
  employee_name    TEXT NOT NULL,
  unit             TEXT,
  position         TEXT,
  contact_number   TEXT,

  -- Section B-E: Answers stored as JSONB
  -- Q1: alasan, Q2: deskripsi, Q3: durasi, Q4: dampak, Q5: area terdampak
  -- Q6: harapan, Q7: pernah konseling, Q8: keselamatan terancam, Q9: butuh bantuan segera
  -- Section C: durasi, Section D: high priority trigger
  -- Section E: scheduling (waktu, hari, metode, preferensi konselor)
  answers          JSONB NOT NULL DEFAULT '{}',

  -- Section F: Consent checkboxes
  consents         JSONB NOT NULL DEFAULT '{}',

  -- Priority flag: triggered by Q8 or Q9 = 'Ya' or 'Tidak yakin'
  is_high_priority BOOLEAN NOT NULL DEFAULT false,

  -- Workflow
  submission_status TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (submission_status IN ('submitted', 'in_progress', 'completed', 'closed')),

  submitted_by            UUID REFERENCES users(user_id),
  assigned_counselor_id   UUID REFERENCES users(user_id),

  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- ── Employee Counseling Sessions (Counselor Recording - 10 Sections) ──────────
CREATE TABLE employee_counseling_sessions (
  session_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES employee_counseling_submissions(submission_id) ON DELETE CASCADE,

  session_number  INTEGER NOT NULL DEFAULT 1,
  session_date    DATE,
  session_time    TIME,
  method          TEXT CHECK (method IN ('tatap_muka', 'online')),

  -- Section 1: Session Information (employee, counselor, date/time, method)
  section_1_info  JSONB NOT NULL DEFAULT '{}',

  -- Section 2: Presenting Concern (pokok permasalahan dari perspektif karyawan)
  section_2_presenting_concern TEXT,

  -- Section 3: Key Points Discussed (3-5 poin utama)
  section_3_key_points JSONB NOT NULL DEFAULT '[]',

  -- Section 4: Counselor Observation
  section_4_observation TEXT,

  -- Section 5: Counselor Intervention
  section_5_intervention JSONB NOT NULL DEFAULT '{}',

  -- Section 6: Employee Insight/Response
  section_6_employee_insight TEXT,

  -- Section 7: Agreed Action Plan
  section_7_action_plan JSONB NOT NULL DEFAULT '[]',

  -- Section 8: Risk and Safety Check
  section_8_risk JSONB NOT NULL DEFAULT '{}',

  -- Section 9: Follow-up
  section_9_followup JSONB NOT NULL DEFAULT '{}',

  -- Section 10: Closure (only filled when submission_status = 'closed')
  section_10_closure JSONB,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- ── Employee Counseling Access Log (Confidentiality Requirement) ──────────────
CREATE TABLE employee_counseling_access_log (
  log_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  submission_id  UUID NOT NULL REFERENCES employee_counseling_submissions(submission_id) ON DELETE CASCADE,
  accessed_by    UUID NOT NULL REFERENCES users(user_id),
  accessed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  access_reason  TEXT
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_ec_submissions_tenant    ON employee_counseling_submissions(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ec_submissions_status      ON employee_counseling_submissions(tenant_id, submission_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_ec_submissions_priority   ON employee_counseling_submissions(tenant_id, is_high_priority) WHERE deleted_at IS NULL AND is_high_priority = true;
CREATE INDEX idx_ec_submissions_counselor  ON employee_counseling_submissions(tenant_id, assigned_counselor_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_ec_sessions_tenant        ON employee_counseling_sessions(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ec_sessions_submission    ON employee_counseling_sessions(tenant_id, submission_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_ec_access_log_tenant      ON employee_counseling_access_log(tenant_id);
CREATE INDEX idx_ec_access_log_submission  ON employee_counseling_access_log(tenant_id, submission_id);
