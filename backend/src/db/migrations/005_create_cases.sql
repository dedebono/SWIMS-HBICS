-- ============================================================================
-- SWIMS Database Schema — 005: Cases
-- ============================================================================

CREATE TABLE cases (
  case_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  student_id         UUID NOT NULL REFERENCES students(student_id) ON DELETE RESTRICT,
  case_type          TEXT NOT NULL CHECK (case_type IN ('BEHAVIORAL', 'EMOTIONAL', 'MEDICAL', 'ACADEMIC', 'POSITIVE')),
  status             TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'MONITORING', 'CLOSED')),
  risk_level         TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  risk_level_source  TEXT DEFAULT 'MANUAL' CHECK (risk_level_source IN ('MANUAL', 'AUTO')),
  assigned_counselor UUID REFERENCES users(user_id),
  school_phase_ref   TEXT,         -- snapshot of enrollment phase at time of case creation
  opened_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_date        DATE,
  summary            TEXT,
  metadata           JSONB DEFAULT '{}',
  created_by         UUID NOT NULL REFERENCES users(user_id),
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

COMMENT ON COLUMN cases.risk_level_source IS 'MANUAL = set by counselor (locks auto-recalc), AUTO = system-calculated';
COMMENT ON COLUMN cases.school_phase_ref IS 'Snapshot of student enrollment phase when case was opened';
COMMENT ON COLUMN cases.summary IS 'Generated summary during data lifecycle SUMMARIZE stage';
