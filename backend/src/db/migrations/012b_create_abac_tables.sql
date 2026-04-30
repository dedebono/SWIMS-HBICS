-- ============================================================================
-- SWIMS Database Schema — 012b: Substitution Schedule
-- Referenced by ABAC rules for SUBSTITUTE_TEACHER access control
-- ============================================================================

CREATE TABLE substitution_schedule (
  schedule_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  substitute_id    UUID NOT NULL REFERENCES users(user_id),  -- the substitute teacher
  original_teacher UUID NOT NULL REFERENCES users(user_id),  -- teacher being substituted
  class_name       TEXT NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE substitution_schedule IS 'Tracks active substitution periods for SUBSTITUTE_TEACHER ABAC';

-- ============================================================================
-- Teacher-Class Assignments (for TEACHER ABAC)
-- ============================================================================

CREATE TABLE teacher_class_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id       UUID NOT NULL REFERENCES users(user_id),
  class_name    TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE teacher_class_assignments IS 'Maps teachers to their assigned classes for ABAC enforcement';
