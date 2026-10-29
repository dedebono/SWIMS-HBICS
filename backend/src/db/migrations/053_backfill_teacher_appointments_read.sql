-- Backfill TEACER appointments:read for existing tenants.
--
-- The teacher case-dashboard "Janji Temu" tab calls
-- GET /api/appointments?type=student&student_id=… which is gated by
-- checkPermission('appointments', 'read'). TEACHER was seeded with
-- appointments = none (and migration 030 deliberately backfilled only
-- COUNSELOR/SCHOOL_NURSE/SCHOOL_HEAD/IT_ADMIN/PERSONAL), so every teacher
-- got 403 Forbidden on that request.
--
-- Read-only is sufficient: the appointment row is created server-side by
-- submitCaseCounseling when the questionnaire is submitted. The teacher
-- never creates or reschedules appointments.
INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
SELECT t.tenant_id, v.role, v.resource, v.action, v.allowed
FROM tenants t
CROSS JOIN (VALUES
  ('TEACHER', 'appointments', 'read', true)
) AS v(role, resource, action, allowed)
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, role, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed;