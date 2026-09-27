-- Seed: school psychologists for demo tenant(s)
-- Run after migrations 045_create_school_psychologists

-- Insert sample psychologists for the first tenant (demo purposes)
DO $$
DECLARE
  demo_tenant_id UUID;
BEGIN
  -- Get the first tenant (demo tenant)
  SELECT tenant_id INTO demo_tenant_id
  FROM tenants
  WHERE deleted_at IS NULL
  LIMIT 1;

  IF demo_tenant_id IS NOT NULL THEN
    -- Dr. Retno Wulandari - Anak & Remaja
    INSERT INTO school_psychologists (tenant_id, full_name, expertise, consultation_fee, is_active)
    VALUES (demo_tenant_id, 'Dr. Retno Wulandari, M.Psi.', 'Anak & Remaja, Gangguan Perilaku', 500000, true)
    ON CONFLICT DO NOTHING;

    -- Dr. Budi Santoso - Emosional & Kecemasan
    INSERT INTO school_psychologists (tenant_id, full_name, expertise, consultation_fee, is_active)
    VALUES (demo_tenant_id, 'Dr. Budi Santoso, M.Psi.', 'Kasus Emosional, Kecemasan', 450000, true)
    ON CONFLICT DO NOTHING;

    -- Ps. Anita Dewi, M.Psi. - Belajar & Skolastik
    INSERT INTO school_psychologists (tenant_id, full_name, expertise, consultation_fee, is_active)
    VALUES (demo_tenant_id, 'Ps. Anita Dewi, M.Psi.', 'Kesulitan Belajar, Tes Skolastik', 400000, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
