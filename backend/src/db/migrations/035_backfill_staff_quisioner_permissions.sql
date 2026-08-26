-- 035: backfill RBAC rows for the new staff_quisioner resource
INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
SELECT t.tenant_id, v.role, 'staff_quisioner', v.action, v.allowed
FROM tenants t
CROSS JOIN (VALUES
  ('COUNSELOR','read',true),
  ('COUNSELOR','update',true),
  ('PSYCHOLOGIST','read',true),
  ('PSYCHOLOGIST','update',true),
  ('IT_ADMIN','create',true),
  ('IT_ADMIN','read',true),
  ('IT_ADMIN','update',true),
  ('IT_ADMIN','delete',true)
) AS v(role, action, allowed)
ON CONFLICT (tenant_id, role, resource, action) DO NOTHING;
