-- ============================================================================
-- SWIMS Database Schema — 006: Incidents
-- ============================================================================

CREATE TABLE incidents (
  incident_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  case_id          UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  student_id       UUID NOT NULL REFERENCES students(student_id) ON DELETE RESTRICT,
  category         TEXT NOT NULL,
  sub_category     TEXT,
  severity         TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description      TEXT NOT NULL,
  location         TEXT,
  incident_at      TIMESTAMPTZ NOT NULL,
  reported_by      UUID NOT NULL REFERENCES users(user_id),
  witnesses        JSONB DEFAULT '[]',    -- array of {user_id, name, statement}
  immediate_actions TEXT,
  language_flag    BOOLEAN DEFAULT false,  -- true if neutral language check failed
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

COMMENT ON COLUMN incidents.witnesses IS 'JSON array: [{user_id, name, statement}]';
COMMENT ON COLUMN incidents.language_flag IS 'Set to true when description contains flagged stigmatizing language';
COMMENT ON COLUMN incidents.immediate_actions IS 'Actions taken immediately after the incident';
