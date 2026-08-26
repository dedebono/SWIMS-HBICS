-- ============================================================================
-- SWIMS Database Schema — 031: Quisioner threshold setting
-- ============================================================================

CREATE TABLE IF NOT EXISTS quisioner_settings (
  tenant_id  UUID PRIMARY KEY REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  threshold INTEGER NOT NULL DEFAULT 7,
  updated_at TIMESTAMPTZ DEFAULT now()
);
