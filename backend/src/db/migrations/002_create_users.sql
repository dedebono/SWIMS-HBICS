-- ============================================================================
-- SWIMS Database Schema — 002: Users
-- ============================================================================

CREATE TABLE users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN (
    'TEACHER', 'SUBSTITUTE_TEACHER', 'COUNSELOR', 'SCHOOL_NURSE',
    'SCHOOL_HEAD', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN'
  )),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE(tenant_id, email)
);

COMMENT ON COLUMN users.role IS 'One of: TEACHER, SUBSTITUTE_TEACHER, COUNSELOR, SCHOOL_NURSE, SCHOOL_HEAD, BOARD_MEMBER, CASE_REVIEWER, IT_ADMIN';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash — never store plaintext';
