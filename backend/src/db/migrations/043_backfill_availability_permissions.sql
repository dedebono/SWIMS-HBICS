-- ============================================================================
-- SWIMS — 043: Backfill role_permissions for 'availability' resource
-- Existing tenants won't have rows for this resource, causing 403 on all
-- availability routes. Seed from the static PERMISSIONS matrix.
-- ============================================================================

INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
SELECT t.tenant_id, v.role, v.resource, v.action, v.allowed
FROM tenants t
CROSS JOIN (VALUES
  -- COUNSELOR: crud
  ('COUNSELOR',      'availability', 'create', true),
  ('COUNSELOR',      'availability', 'read',   true),
  ('COUNSELOR',      'availability', 'update', true),
  ('COUNSELOR',      'availability', 'delete', true),
  -- PSYCHOLOGIST: crud
  ('PSYCHOLOGIST',   'availability', 'create', true),
  ('PSYCHOLOGIST',   'availability', 'read',   true),
  ('PSYCHOLOGIST',   'availability', 'update', true),
  ('PSYCHOLOGIST',   'availability', 'delete', true),
  -- SCHOOL_NURSE: read-only
  ('SCHOOL_NURSE',   'availability', 'create', false),
  ('SCHOOL_NURSE',   'availability', 'read',   true),
  ('SCHOOL_NURSE',   'availability', 'update', false),
  ('SCHOOL_NURSE',   'availability', 'delete', false),
  -- SCHOOL_HEAD: read-only
  ('SCHOOL_HEAD',    'availability', 'create', false),
  ('SCHOOL_HEAD',    'availability', 'read',   true),
  ('SCHOOL_HEAD',    'availability', 'update', false),
  ('SCHOOL_HEAD',    'availability', 'delete', false),
  -- IT_ADMIN: crud
  ('IT_ADMIN',       'availability', 'create', true),
  ('IT_ADMIN',       'availability', 'read',   true),
  ('IT_ADMIN',       'availability', 'update', true),
  ('IT_ADMIN',       'availability', 'delete', true),
  -- PERSONAL: read-only
  ('PERSONAL',       'availability', 'create', false),
  ('PERSONAL',       'availability', 'read',   true),
  ('PERSONAL',       'availability', 'update', false),
  ('PERSONAL',       'availability', 'delete', false),
  -- All other roles: none
  ('TEACHER',        'availability', 'create', false),
  ('TEACHER',        'availability', 'read',   false),
  ('TEACHER',        'availability', 'update', false),
  ('TEACHER',        'availability', 'delete', false),
  ('SUBSTITUTE_TEACHER', 'availability', 'create', false),
  ('SUBSTITUTE_TEACHER', 'availability', 'read',   false),
  ('SUBSTITUTE_TEACHER', 'availability', 'update', false),
  ('SUBSTITUTE_TEACHER', 'availability', 'delete', false),
  ('BOARD_MEMBER',   'availability', 'create', false),
  ('BOARD_MEMBER',   'availability', 'read',   false),
  ('BOARD_MEMBER',   'availability', 'update', false),
  ('BOARD_MEMBER',   'availability', 'delete', false),
  ('CASE_REVIEWER',  'availability', 'create', false),
  ('CASE_REVIEWER',  'availability', 'read',   false),
  ('CASE_REVIEWER',  'availability', 'update', false),
  ('CASE_REVIEWER',  'availability', 'delete', false)
) AS v(role, resource, action, allowed)
ON CONFLICT (tenant_id, role, resource, action) DO NOTHING;
