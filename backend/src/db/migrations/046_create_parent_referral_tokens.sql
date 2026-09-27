-- parent_referral_tokens: token + tracking alur rujukan
CREATE TABLE parent_referral_tokens (
  token_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  appointment_id    UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
  student_id        UUID NOT NULL,
  parent_phone      TEXT NOT NULL,
  parent_name       TEXT,
  token             TEXT NOT NULL UNIQUE,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  choice_status     TEXT NOT NULL DEFAULT 'pending' CHECK (
    choice_status IN ('pending', 'school_psychologist', 'private_psychologist',
                      'psychologist_selected', 'payment_pending',
                      'payment_confirmed', 'schedule_confirmed', 'expired')
  ),
  selected_psychologist_id UUID REFERENCES school_psychologists(psychologist_id),
  payment_amount    INTEGER,
  payment_confirmed_at TIMESTAMPTZ,
  payment_notes     TEXT,
  confirmed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_parent_referral_tokens_token     ON parent_referral_tokens(token);
CREATE INDEX idx_parent_referral_tokens_tenant    ON parent_referral_tokens(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_parent_referral_tokens_appointment ON parent_referral_tokens(appointment_id);
