-- ============================================================================
-- SWIMS Database Schema — 018: Update Forms and Homeroom Role
-- ============================================================================

-- 1. Add metadata columns to support extended forms
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE case_communications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE positive_observations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. Add is_sensitive to cases for ABAC filtering
ALTER TABLE cases ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN DEFAULT false;

-- 3. Update Users role constraint to include HOMEROOM_TEACHER
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'TEACHER', 'SUBSTITUTE_TEACHER', 'HOMEROOM_TEACHER', 'COUNSELOR', 'SCHOOL_NURSE',
  'SCHOOL_HEAD', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN'
));

-- 4. Create homeroom_assignments table
CREATE TABLE IF NOT EXISTS homeroom_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  teacher_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  class_name    TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, teacher_id, class_name, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_homeroom_assignments_tenant_teacher ON homeroom_assignments(tenant_id, teacher_id);

-- Apply tenant isolation to homeroom_assignments
ALTER TABLE homeroom_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_homeroom_assignments ON homeroom_assignments
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
