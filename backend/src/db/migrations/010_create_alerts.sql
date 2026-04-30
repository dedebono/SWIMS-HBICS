-- ============================================================================
-- SWIMS Database Schema — 010: Alerts
-- ============================================================================

CREATE TABLE alerts (
  alert_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  student_id       UUID NOT NULL REFERENCES students(student_id) ON DELETE RESTRICT,
  triggered_by     TEXT NOT NULL,           -- rule name: RAPID_ESCALATION, REPEATED_SAME_CATEGORY, etc.
  pattern_data     JSONB NOT NULL DEFAULT '{}',  -- snapshot of data that triggered the alert
  severity         TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status           TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED', 'ESCALATED')),
  assigned_to      UUID REFERENCES users(user_id),
  reviewed_by      UUID REFERENCES users(user_id),
  reviewed_at      TIMESTAMPTZ,
  dismissal_reason TEXT,
  expires_at       TIMESTAMPTZ NOT NULL,    -- all alerts must auto-expire
  created_at       TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN alerts.triggered_by IS 'Pattern detection rule name that generated this alert';
COMMENT ON COLUMN alerts.pattern_data IS 'Snapshot of the triggering data for audit/review purposes';
COMMENT ON COLUMN alerts.expires_at IS 'Alert auto-expires after this time; must be set on creation';
