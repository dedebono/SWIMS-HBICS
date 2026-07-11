-- ============================================================================
-- SWIMS Database Schema — 023: Dynamic Role Permissions
-- Stores the RBAC permission matrix per tenant so roles (teacher, counselor,
-- school head, school nurse, etc.) can be configured dynamically from the
-- User Management UI instead of being hard-coded in the application.
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  tenant_id UUID        NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  role      TEXT        NOT NULL,
  resource  TEXT        NOT NULL,
  action    TEXT        NOT NULL,
  allowed   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, role, resource, action)
);

COMMENT ON TABLE role_permissions IS
  'Per-tenant RBAC matrix. One row per (role, resource, action). Seeded from the'
  'static PERMISSIONS default on first read; editable from User Management.';

CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant
  ON role_permissions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_role
  ON role_permissions (tenant_id, role);
