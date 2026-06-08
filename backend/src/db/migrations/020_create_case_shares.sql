-- ============================================================================
-- SWIMS Database Schema — 020: Case Shares (Teacher Collaboration)
-- ============================================================================

-- Table for sharing cases with multiple teachers
-- Allows teachers to view and participate in case interventions/communications
CREATE TABLE IF NOT EXISTS case_shares (
  share_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  case_id         UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  shared_with     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  shared_by       UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  permission      TEXT NOT NULL DEFAULT 'VIEW' CHECK (permission IN ('VIEW', 'CONTRIBUTE')),
  created_at      TIMESTAMPTZ DEFAULT now(),

  -- Ensure unique shares per case-user pair
  UNIQUE(tenant_id, case_id, shared_with)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_case_shares_case ON case_shares(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_case_shares_user ON case_shares(tenant_id, shared_with);

-- RLS Policies
ALTER TABLE case_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_case_shares ON case_shares
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

COMMENT ON TABLE case_shares IS 'Tracks which teachers a case has been shared with for collaboration';
COMMENT ON COLUMN case_shares.permission IS 'VIEW = read-only access, CONTRIBUTE = can log interventions and communications';
