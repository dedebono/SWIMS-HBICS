-- 049: Avatar (foto profil) for every account
--
-- WHY: staff and students were only identifiable by name/email. A photo makes
-- identification instant on rosters, case assignment and appointment lists.
--
-- WHY a `avatar_key` column instead of a `photo_url` TEXT holding a data URL:
-- the psychologist flow stored the whole image as a base64 data URL in the row,
-- which bloats every SELECT that touches the table (a 200 KB photo is ~270 KB
-- of TEXT per row, replicated in every query result and every backup). Here the
-- bytes live on disk under /app/media/avatars/<tenant>/ and the row only holds
-- the storage key.
--
-- Both tables get the column because `GET /api/admin/users` UNIONs staff
-- (`users`) with students (`students`) and the admin table renders one row type
-- for both.
--
-- `avatar_updated_at` doubles as the cache-buster: the browser is told to
-- re-fetch the image when it changes, so replacing a photo shows up immediately
-- instead of serving the stale cached copy.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_key TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS avatar_key TEXT;
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN users.avatar_key IS
  'Storage key of the profile photo inside /app/media (e.g. avatars/<tenant>/<uuid>.webp). NULL when no photo is set.';
COMMENT ON COLUMN users.avatar_updated_at IS
  'Timestamp of the last avatar upload — used as the HTTP cache-buster.';
COMMENT ON COLUMN students.avatar_key IS
  'Storage key of the profile photo inside /app/media. NULL when no photo is set.';
COMMENT ON COLUMN students.avatar_updated_at IS
  'Timestamp of the last avatar upload — used as the HTTP cache-buster.';