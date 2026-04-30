-- ============================================================================
-- SWIMS Database Schema — 003: Students
-- ============================================================================

CREATE TABLE students (
  student_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  full_name     TEXT NOT NULL,
  date_of_birth DATE,
  gender        TEXT,
  national_id   TEXT,                -- encrypted at application layer (AES-256-GCM)
  qr_code       TEXT UNIQUE,         -- for QR scanning identification
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

COMMENT ON COLUMN students.student_id IS 'Immutable UUID, never reused even after deletion';
COMMENT ON COLUMN students.national_id IS 'Encrypted at app layer via AES-256-GCM. Stores ciphertext:iv format';
COMMENT ON COLUMN students.qr_code IS 'Unique QR code value for camera-based identification';
COMMENT ON COLUMN students.metadata IS 'Extensible fields: parent contacts, address, notes, etc.';
