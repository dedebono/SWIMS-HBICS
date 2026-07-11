-- ============================================================================
-- SWIMS Database Schema — 024: Retire HOMEROOM_TEACHER role
-- Removes HOMEROOM_TEACHER from the users.role CHECK constraint (added in 018).
-- Any existing HOMEROOM_TEACHER users are reassigned to TEACHER first so the
-- constraint change cannot fail on existing rows.
-- ============================================================================

-- 1. Reassign existing HOMEROOM_TEACHER users to TEACHER (role is being retired)
UPDATE users SET role = 'TEACHER' WHERE role = 'HOMEROOM_TEACHER';

-- 2. Drop and recreate the role CHECK constraint without HOMEROOM_TEACHER
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'TEACHER', 'SUBSTITUTE_TEACHER', 'COUNSELOR', 'SCHOOL_NURSE',
  'SCHOOL_HEAD', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN'
));
