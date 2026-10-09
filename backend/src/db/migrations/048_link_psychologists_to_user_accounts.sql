-- Link referral psychologist profiles (school_psychologists) to real login
-- accounts (users with role='PSYCHOLOGIST').
--
-- WHY: the two tables had drifted apart. Psychologists were created through
-- user management (rows in `users`), but the admin "Kelola Psikolog" page only
-- ever read `school_psychologists`, which was empty — so existing psychologists
-- never appeared. Adding `user_id` lets one row serve both purposes: the login
-- account plus the referral profile (expertise / fee / photo).
--
-- 1. Add the optional link + lookup index.
-- 2. Backfill by matching full_name within the same tenant (best effort; the
--    seed/demo names differ, so unmatched rows stay NULL and are treated as
--    profile-only entries).
-- 3. Guarantee every active PSYCHOLOGIST account has a profile row, so the
--    admin list can be driven off `users` and never miss an account.

ALTER TABLE school_psychologists
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_psychologists_user
  ON school_psychologists (tenant_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- Best-effort backfill: match a profile to an account with the same full name
-- in the same tenant.
UPDATE school_psychologists sp
SET user_id = u.user_id
FROM users u
WHERE sp.user_id IS NULL
  AND sp.deleted_at IS NULL
  AND u.deleted_at IS NULL
  AND u.role = 'PSYCHOLOGIST'
  AND u.tenant_id = sp.tenant_id
  AND lower(trim(u.full_name)) = lower(trim(sp.full_name));

-- Ensure every active psychologist ACCOUNT has a profile row. Placeholder
-- values are marked so an admin can spot and complete them.
INSERT INTO school_psychologists (tenant_id, user_id, full_name, expertise, consultation_fee, is_active)
SELECT
  u.tenant_id,
  u.user_id,
  u.full_name,
  'Belum diisi',
  0,
  COALESCE(u.is_active, true)
FROM users u
WHERE u.role = 'PSYCHOLOGIST'
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM school_psychologists sp
    WHERE sp.user_id = u.user_id AND sp.deleted_at IS NULL
  );