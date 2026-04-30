-- ============================================================================
-- SWIMS Database Schema — 008: Media Assets
-- ============================================================================

CREATE TABLE media_assets (
  asset_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  incident_id      UUID REFERENCES incidents(incident_id),
  case_id          UUID REFERENCES cases(case_id),
  uploader_id      UUID NOT NULL REFERENCES users(user_id),
  file_name        TEXT NOT NULL,
  file_hash        TEXT NOT NULL,       -- SHA-256 hash of original file
  mime_type        TEXT NOT NULL,
  storage_key      TEXT NOT NULL,       -- S3 object key
  redaction_status TEXT DEFAULT 'NONE' CHECK (redaction_status IN ('NONE', 'PENDING', 'REDACTED')),
  redacted_key     TEXT,                -- S3 key for redacted version
  retention_expiry DATE,
  access_logs      JSONB DEFAULT '[]',
  version          INTEGER DEFAULT 1,
  created_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

COMMENT ON COLUMN media_assets.file_hash IS 'SHA-256 hash of the original uploaded file for integrity verification';
COMMENT ON COLUMN media_assets.storage_key IS 'Full S3 object key, e.g. tenants/{tenant_id}/media/{asset_id}';
COMMENT ON COLUMN media_assets.redacted_key IS 'S3 key for the redacted version of the file, if applicable';
COMMENT ON COLUMN media_assets.retention_expiry IS 'Date after which the file should be purged (set on consent revocation)';
