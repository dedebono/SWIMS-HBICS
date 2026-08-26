-- ============================================================================
-- SWIMS Database Schema — 027: Add PSYCHOLOGIST role + counseling tables
-- ============================================================================

-- 1. Add PSYCHOLOGIST to the role CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'TEACHER', 'SUBSTITUTE_TEACHER', 'COUNSELOR', 'SCHOOL_NURSE',
  'SCHOOL_HEAD', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN', 'PERSONAL',
  'PSYCHOLOGIST'
));

-- 2. Counseling: quisioner questions managed by admin IT
CREATE TABLE IF NOT EXISTS quisioner_questions (
  question_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'checkbox', 'text', 'rating')),
  is_required   BOOLEAN DEFAULT true,
  order_index   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS quisioner_answers (
  answer_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES quisioner_questions(question_id) ON DELETE CASCADE,
  answer_text  TEXT NOT NULL,
  score        INTEGER NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- 3. Counseling: appointments / janji temu
CREATE TABLE IF NOT EXISTS appointments (
  appointment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  type           TEXT NOT NULL CHECK (type IN ('student', 'personal')),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_parent_choice', 'awaiting_psychologist_availability', 'confirmed', 'cancelled', 'completed')),
  scheduled_at   TIMESTAMPTZ,
  location       TEXT CHECK (location IN ('online', 'offline')),
  notes          TEXT,
  created_by     UUID NOT NULL REFERENCES users(user_id),
  created_for    UUID NOT NULL REFERENCES users(user_id), -- student or personal staff
  student_id     UUID REFERENCES students(student_id), -- nullable for personal appointments
  counselor_id   UUID REFERENCES users(user_id),
  psychologist_id UUID REFERENCES users(user_id),
  school_nurse_id UUID REFERENCES users(user_id),
  metadata       JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS availability_slots (
  slot_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  professional_id UUID NOT NULL REFERENCES users(user_id),
  slot_start     TIMESTAMPTZ NOT NULL,
  slot_end       TIMESTAMPTZ NOT NULL,
  is_available   BOOLEAN DEFAULT true,
  appointment_id UUID REFERENCES appointments(appointment_id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_quisioner_questions_tenant ON quisioner_questions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quisioner_answers_question ON quisioner_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_created_for ON appointments(created_for);
CREATE INDEX IF NOT EXISTS idx_appointments_counselor ON appointments(counselor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_psychologist ON appointments(psychologist_id);
CREATE INDEX IF NOT EXISTS idx_availability_professional ON availability_slots(professional_id);
