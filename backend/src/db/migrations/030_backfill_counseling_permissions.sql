-- Backfill missing permissions for new resources: quisioner and appointments
-- for all existing tenants.

-- quisioner permissions
INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
SELECT t.tenant_id, v.role, v.resource, v.action, v.allowed
FROM tenants t
CROSS JOIN (VALUES
  ('TEACHER', 'quisioner', 'read', true),
  ('SUBSTITUTE_TEACHER', 'quisioner', 'read', true),
  ('COUNSELOR', 'quisioner', 'read', true),
  ('SCHOOL_NURSE', 'quisioner', 'read', true),
  ('SCHOOL_HEAD', 'quisioner', 'read', true),
  ('IT_ADMIN', 'quisioner', 'create', true),
  ('IT_ADMIN', 'quisioner', 'read', true),
  ('IT_ADMIN', 'quisioner', 'update', true),
  ('IT_ADMIN', 'quisioner', 'delete', true),
  ('PSYCHOLOGIST', 'quisioner', 'read', true)
) AS v(role, resource, action, allowed)
ON CONFLICT (tenant_id, role, resource, action) DO NOTHING;

-- appointments permissions
INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
SELECT t.tenant_id, v.role, v.resource, v.action, v.allowed
FROM tenants t
CROSS JOIN (VALUES
  ('COUNSELOR', 'appointments', 'create', true),
  ('COUNSELOR', 'appointments', 'read', true),
  ('COUNSELOR', 'appointments', 'update', true),
  ('COUNSELOR', 'appointments', 'delete', true),
  ('SCHOOL_NURSE', 'appointments', 'read', true),
  ('SCHOOL_NURSE', 'appointments', 'update', true),
  ('SCHOOL_HEAD', 'appointments', 'read', true),
  ('SCHOOL_HEAD', 'appointments', 'update', true),
  ('IT_ADMIN', 'appointments', 'create', true),
  ('IT_ADMIN', 'appointments', 'read', true),
  ('IT_ADMIN', 'appointments', 'update', true),
  ('IT_ADMIN', 'appointments', 'delete', true),
  ('PERSONAL', 'appointments', 'create', true),
  ('PERSONAL', 'appointments', 'read', true),
  ('PSYCHOLOGIST', 'appointments', 'create', true),
  ('PSYCHOLOGIST', 'appointments', 'read', true),
  ('PSYCHOLOGIST', 'appointments', 'update', true),
  ('PSYCHOLOGIST', 'appointments', 'delete', true)
) AS v(role, resource, action, allowed)
ON CONFLICT (tenant_id, role, resource, action) DO NOTHING;
