-- ============================================================================
-- SWIMS Database Schema — 004: Student Enrollment History
-- ============================================================================

CREATE TABLE student_enrollment_history (
  enrollment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(student_id) ON DELETE RESTRICT,
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  school_level  TEXT NOT NULL CHECK (school_level IN ('PRESCHOOL', 'PRIMARY', 'SECONDARY', 'SENIOR_HIGH')),
  school_phase  TEXT,            -- grade/year label e.g. "Grade 7", "Year 10"
  class_name    TEXT,
  academic_year TEXT NOT NULL,   -- e.g. "2025/2026"
  enrolled_at   DATE NOT NULL,
  graduated_at  DATE,
  transfer_note TEXT
);

COMMENT ON COLUMN student_enrollment_history.school_level IS 'PRESCHOOL | PRIMARY | SECONDARY | SENIOR_HIGH';
COMMENT ON COLUMN student_enrollment_history.school_phase IS 'Human-readable grade label e.g. "Grade 7"';
COMMENT ON COLUMN student_enrollment_history.academic_year IS 'Format: "2025/2026"';
