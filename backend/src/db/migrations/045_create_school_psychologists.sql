-- school_psychologists: daftar psikolog rekomendasi sekolah
CREATE TABLE school_psychologists (
  psychologist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  expertise       TEXT NOT NULL,
  photo_url       TEXT,
  consultation_fee INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX idx_school_psychologists_tenant ON school_psychologists(tenant_id) WHERE deleted_at IS NULL;
