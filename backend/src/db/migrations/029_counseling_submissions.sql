CREATE TABLE IF NOT EXISTS counseling_submissions (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  case_id UUID NOT NULL,
  submitted_by UUID NOT NULL REFERENCES users(user_id),
  student_id UUID NOT NULL REFERENCES students(student_id),
  recommendation TEXT NOT NULL CHECK (recommendation IN ('professional','internal')),
  score INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_counseling_submissions_case ON counseling_submissions(case_id);
