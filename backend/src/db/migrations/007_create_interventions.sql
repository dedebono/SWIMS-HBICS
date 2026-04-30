-- ============================================================================
-- SWIMS Database Schema — 007: Interventions
-- ============================================================================

CREATE TABLE interventions (
  intervention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  case_id         UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  incident_id     UUID REFERENCES incidents(incident_id),  -- nullable: case-level interventions
  assigned_staff  JSONB NOT NULL DEFAULT '[]',             -- array of user_id strings
  type            TEXT NOT NULL,
  description     TEXT NOT NULL,
  scheduled_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  outcome         TEXT,
  effectiveness   INTEGER CHECK (effectiveness BETWEEN 1 AND 5),
  created_by      UUID NOT NULL REFERENCES users(user_id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

COMMENT ON COLUMN interventions.incident_id IS 'Nullable — intervention can be at case level without specific incident';
COMMENT ON COLUMN interventions.assigned_staff IS 'JSON array of user_id UUIDs';
COMMENT ON COLUMN interventions.effectiveness IS 'Scale 1-5, set after completion';
