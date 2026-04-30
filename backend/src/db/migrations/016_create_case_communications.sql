-- 016_create_case_communications.sql
-- Append-only thread for Parent Communication Log

CREATE TABLE IF NOT EXISTS case_communications (
  comm_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants NOT NULL,
  case_id           UUID REFERENCES cases NOT NULL,
  author_id         UUID REFERENCES users NOT NULL,
  message           TEXT NOT NULL,
  channel           TEXT DEFAULT 'IN_PERSON',    -- e.g. PHONE, EMAIL, IN_PERSON, APP
  contact_name      TEXT NOT NULL,               -- e.g. "Jane Doe (Mother)"
  contact_role      TEXT NOT NULL,               -- e.g. "PARENT", "GUARDIAN"
  created_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ                  -- For RTBF compliance
);

-- CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_case_communications_case_id ON case_communications(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_case_communications_created ON case_communications(tenant_id, created_at);

-- RLS POLICIES
ALTER TABLE case_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_case_communications ON case_communications
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Apply standard audit triggers to block UPDATE/DELETE (append-only strictly)
CREATE OR REPLACE FUNCTION block_update_delete_case_comms()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NULL THEN 
    -- RTBF soft delete allows updates to deleted_at
    RAISE EXCEPTION 'Updates are not allowed on case_communications table';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Hard deletes are not allowed on case_communications table';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_append_only_case_comms
  BEFORE UPDATE OR DELETE ON case_communications
  FOR EACH ROW EXECUTE FUNCTION block_update_delete_case_comms();
