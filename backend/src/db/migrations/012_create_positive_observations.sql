-- ============================================================================
-- SWIMS Database Schema — 012: Positive Observations
-- ============================================================================

CREATE TABLE positive_observations (
  observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  student_id     UUID NOT NULL REFERENCES students(student_id) ON DELETE RESTRICT,
  case_id        UUID REFERENCES cases(case_id),
  recorded_by    UUID NOT NULL REFERENCES users(user_id),
  category       TEXT NOT NULL,
  description    TEXT NOT NULL,
  observed_at    TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

COMMENT ON TABLE positive_observations IS 'Records of positive student behaviors and achievements';
COMMENT ON COLUMN positive_observations.case_id IS 'Optional link to a POSITIVE-type case';
