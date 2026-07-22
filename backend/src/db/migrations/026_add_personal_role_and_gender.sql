-- ============================================================================
-- SWIMS Database Schema — 026: Add PERSONAL role + gender column on users
-- Adds a new PERSONAL role (no case access) and a nullable `gender` column
-- available to ALL roles (optional). Purely additive — no existing data is
-- touched, so the migration is safe to run on a populated database.
-- ============================================================================

-- 1. Add nullable gender column (optional for every role)
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;

-- 2. Add PERSONAL to the role CHECK constraint.
--    We DROP + recreate because Postgres cannot alter the value list of an
--    existing CHECK inline. All 8 prior roles remain in the list, so existing
--    rows still satisfy the constraint (no reassign needed — we are ADDING a
--    role, not retiring one).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'TEACHER', 'SUBSTITUTE_TEACHER', 'COUNSELOR', 'SCHOOL_NURSE',
  'SCHOOL_HEAD', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN', 'PERSONAL'
));

-- 3. Backfill PERSONAL default permissions for tenants already seeded before
--    this role existed. New tenants are seeded automatically from PERMISSIONS.
--    PERSONAL gets NO access (all false) — it cannot open/read cases; its only
--    purpose is a personal login account (future: appointment booking with
--    counselors). Idempotent via ON CONFLICT DO NOTHING.
INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
SELECT t.tenant_id, 'PERSONAL', r.resource, a.action, false
FROM tenants t
CROSS JOIN (VALUES
  ('cases'),('incidents'),('interventions'),('media_assets'),('alerts'),
  ('reports'),('consents'),('audit_logs'),('positive_observations'),('students'),('admin')
) AS r(resource)
CROSS JOIN (VALUES ('create'),('read'),('update'),('delete')) AS a(action)
ON CONFLICT (tenant_id, role, resource, action) DO NOTHING;
