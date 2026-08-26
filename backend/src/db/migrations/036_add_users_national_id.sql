-- 036: NIK (national/employee id) columns on users for anonymous staff quisioner identification
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_users_national_id_hash ON users(tenant_id, national_id_hash) WHERE deleted_at IS NULL;
