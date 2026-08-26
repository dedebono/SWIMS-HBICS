-- 037: Daftar Pertanyaan (question lists) untuk mengelompokkan pertanyaan
-- dan meng-assign ke Staff atau Janji Temu (Siswa / Kasus).

CREATE TABLE quisioner_question_lists (
  question_list_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_question_lists_tenant ON quisioner_question_lists(tenant_id);

-- Seed default "Daftar Umum" per tenant (melayani semua target)
INSERT INTO quisioner_question_lists (tenant_id, name, description, targets, is_active)
SELECT
  tenant_id,
  'Daftar Umum',
  'Daftar pertanyaan default',
  '["staff","appointment_student","appointment_case"]'::jsonb,
  true
FROM tenants
WHERE deleted_at IS NULL;
