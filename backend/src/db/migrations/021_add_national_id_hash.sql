-- Add deterministic hash column for national ID deduplication
ALTER TABLE students ADD COLUMN national_id_hash TEXT;

-- Create index for fast lookups
CREATE INDEX idx_students_national_id_hash ON students(tenant_id, national_id_hash) WHERE deleted_at IS NULL;

-- Populate existing hashes (application will handle new inserts)
-- Note: we need an application-level script to populate this for old records.
