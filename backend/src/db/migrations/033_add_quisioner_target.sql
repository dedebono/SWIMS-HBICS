-- 033: quisioner usage target (student case flow vs staff flow)
ALTER TABLE quisioner_settings
  ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'student'
  CHECK (target IN ('student', 'staff'));
