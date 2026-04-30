-- ============================================================================
-- SWIMS Database Schema — 011: Audit Logs (Append-Only)
-- ============================================================================

CREATE TABLE audit_logs (
  log_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID,
  actor_id     UUID,               -- user who performed the action
  action       TEXT NOT NULL,       -- e.g. CASE_CREATED, INCIDENT_UPDATED, RTBF_EXECUTED
  entity_type  TEXT NOT NULL,       -- e.g. cases, incidents, students
  entity_id    UUID,
  before_state JSONB,              -- snapshot of entity state before change
  after_state  JSONB,              -- snapshot of entity state after change
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
  -- NO deleted_at column. This table is APPEND-ONLY.
);

COMMENT ON TABLE audit_logs IS 'Append-only audit trail. No UPDATE or DELETE operations are permitted.';
COMMENT ON COLUMN audit_logs.before_state IS 'JSON snapshot of the entity before mutation (null for CREATE)';
COMMENT ON COLUMN audit_logs.after_state IS 'JSON snapshot of the entity after mutation (null for DELETE)';

-- Prevent UPDATE and DELETE on audit_logs via trigger
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only. UPDATE and DELETE operations are forbidden.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();
