-- ===========================================================================
-- SWIMS Database Schema — 051: Per-Asset Storage Backend
-- ===========================================================================
-- Storage used to be implicitly "whatever is on disk". Every read hardcoded
-- readLocalFile(), so an asset could never be served from S3 even if the
-- tenant had configured a bucket.
--
-- Now an admin can pick a provider in Pengaturan Sistem → Penyimpanan, and
-- NEW uploads go there. That makes "where does this file live?" a per-asset
-- question, so the answer has to be stored per asset — otherwise switching to
-- S3 would orphan every previously uploaded file.
--
-- Backfill matters: every pre-existing asset is on local disk (the only thing
-- that ever wrote them). It gets 'local' explicitly rather than a NULL default
-- so the read path can dispatch on a guaranteed value.

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'local';

-- Rows that predate the column all live in the local media dir.
UPDATE media_assets SET storage_backend = 'local' WHERE storage_backend IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_storage_backend_check'
  ) THEN
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_storage_backend_check
      CHECK (storage_backend IN ('local', 's3', 'r2', 'firebase', 'gdrive'));
  END IF;
END
$$;

COMMENT ON COLUMN media_assets.storage_backend IS
  'Which storage backend holds THIS asset''s bytes. Read the asset to decide where to fetch it from — NOT the tenant''s current setting, because switching providers must not break files uploaded under the previous one.';
COMMENT ON COLUMN media_assets.storage_key IS
  'Object key/path within storage_backend. For local: path under /app/media. For S3/R2: bucket key. For firebase: object path. For gdrive: Drive file id.';