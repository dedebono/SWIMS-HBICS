-- ============================================================================
-- SWIMS Database Schema — 001: Tenants
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
  tenant_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

COMMENT ON COLUMN tenants.slug IS 'URL-safe identifier used in login/routing (e.g. "springfield-school")';
COMMENT ON COLUMN tenants.settings IS 'Tenant-specific configuration: blocklists, notification prefs, etc.';
