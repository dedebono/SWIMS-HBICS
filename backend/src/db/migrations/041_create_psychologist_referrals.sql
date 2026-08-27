-- Psychologist referrals: counselor recommendation -> 2-party approval -> internal/external psychologist
CREATE TABLE psychologist_referrals (
  referral_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
  recommended_by UUID,
  reason TEXT NOT NULL,
  referral_type TEXT NOT NULL CHECK (referral_type IN ('internal_psychologist', 'puspaga_external')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  leader_id UUID,
  leader_decision_at TIMESTAMPTZ,
  leader_note TEXT,
  external_result_note TEXT,
  external_recorded_by UUID,
  external_recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_psychologist_referrals_tenant ON psychologist_referrals(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_psychologist_referrals_status ON psychologist_referrals(tenant_id, status) WHERE deleted_at IS NULL;
