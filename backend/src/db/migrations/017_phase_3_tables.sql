-- 017_phase_3_tables.sql
-- Cold Archival Table & Reports Tracking

-- 1. Cold Archive Table (Stage 3 Data Lifecycle)
CREATE TABLE IF NOT EXISTS cold_archive (
  archive_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants NOT NULL,
  original_case_id  UUID NOT NULL, -- Do not strictly reference `cases` as it might be deleted
  student_id        UUID NOT NULL, -- Same logic, student might be soft-deleted
  archived_data     JSONB NOT NULL,
  archived_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ    -- Stage 4 hard delete flips this first
);

CREATE INDEX IF NOT EXISTS idx_cold_archive_tenant_student ON cold_archive(tenant_id, student_id);

ALTER TABLE cold_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cold_archive ON cold_archive
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- 2. Reports Table
CREATE TABLE IF NOT EXISTS reports (
  report_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants NOT NULL,
  requested_by      UUID REFERENCES users NOT NULL,
  report_type       TEXT NOT NULL, -- e.g., 'TIMELINE_EXPORT', 'ANALYTICS_SUMMARY'
  status            TEXT NOT NULL DEFAULT 'PROCESSING', -- PROCESSING, COMPLETED, FAILED
  parameters        JSONB DEFAULT '{}',
  storage_key       TEXT, -- S3 Bucket key if COMPLETED
  created_at        TIMESTAMPTZ DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id, created_at);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_reports ON reports
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- RLS bypass for PDF worker if necessary is handled via app.tenant_id context injections
