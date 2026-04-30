-- ============================================================================
-- SWIMS Database Schema — 009: Consents
-- ============================================================================

CREATE TABLE consents (
  consent_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  student_id        UUID NOT NULL REFERENCES students(student_id) ON DELETE RESTRICT,
  given_by          TEXT NOT NULL CHECK (given_by IN ('PARENT', 'GUARDIAN', 'STUDENT')),
  given_by_user_id  UUID REFERENCES users(user_id),
  consent_type      TEXT NOT NULL,
  version           TEXT NOT NULL,        -- consent form version identifier
  granted           BOOLEAN NOT NULL,
  granted_at        TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  revocation_reason TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN consents.given_by IS 'PARENT | GUARDIAN | STUDENT — who provided the consent';
COMMENT ON COLUMN consents.version IS 'Version identifier of the consent form template';
COMMENT ON COLUMN consents.consent_type IS 'E.g. DATA_PROCESSING, MEDIA_CAPTURE, CASE_SHARING';
