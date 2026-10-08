-- ============================================================================
-- SWIMS Database Schema — 047: Align roles across the whole app
--
-- Context: the role vocabulary had drifted into four different lists
-- (users_role_check, the Role TS union, the Role Permissions UI, and the
-- create/edit/filter dropdowns). Three roles were retired or never usable:
--
--   HOMEROOM_TEACHER      — already retired by 024, but still lingered in the
--                           Role Permissions UI and still had permission rows.
--   SUBSTITUTE_TEACHER    — 0 users in every tenant.
--   CASE_REVIEWER         — 0 users in every tenant (its /dashboard/reviewer
--                           portal has no reachable accounts).
--
-- STUDENT is deliberately NOT added to users_role_check: students are records
-- in the `students` table (incident subjects), not login accounts. They have no
-- email/password_hash, cannot authenticate, and have no permission matrix.
-- Creating a student from the admin UI now routes to `students` instead of
-- failing on this constraint. `PERSONAL` remains the self-service login role.
--
-- No student data is touched here: `students` rows and every FK from
-- cases/incidents/interventions/etc. are left exactly as they are.
-- ============================================================================

-- 1. Safety net — fail loudly rather than silently dropping accounts if any
--    tenant still uses a role that is about to disappear.
DO $$
DECLARE
  affected text;
BEGIN
  SELECT string_agg(role || ' (' || cnt || ')', ', ') INTO affected
  FROM (
    SELECT role, count(*)::text AS cnt
    FROM users
    WHERE role IN ('SUBSTITUTE_TEACHER', 'CASE_REVIEWER', 'HOMEROOM_TEACHER')
      AND deleted_at IS NULL
    GROUP BY role
  ) t;
  IF affected IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot retire roles, active accounts still use them: %', affected;
  END IF;
END $$;

-- 2. Drop permission rows for the retired roles.
--    role_permissions has no tenant-scoped FK to users, so these are simply
--    orphan configuration that the UI would otherwise keep displaying.
DELETE FROM role_permissions
WHERE role IN ('SUBSTITUTE_TEACHER', 'CASE_REVIEWER', 'HOMEROOM_TEACHER');

-- 3. Narrow users.role to the eight real account roles.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'TEACHER',
  'COUNSELOR',
  'SCHOOL_NURSE',
  'SCHOOL_HEAD',
  'BOARD_MEMBER',
  'IT_ADMIN',
  'PERSONAL',
  'PSYCHOLOGIST'
));