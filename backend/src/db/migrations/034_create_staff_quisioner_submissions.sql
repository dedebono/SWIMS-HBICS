-- 034: staff mental-health quisioner submissions (separate from student counseling_submissions)
CREATE TABLE IF NOT EXISTS staff_quisioner_submissions (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  staff_user_id UUID NOT NULL REFERENCES users(user_id),
  total_score   INTEGER NOT NULL,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('professional','internal')),
  answers       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','scheduled','closed')),
  counselor_notes TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_quisioner_tenant ON staff_quisioner_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_quisioner_staff  ON staff_quisioner_submissions(staff_user_id);
