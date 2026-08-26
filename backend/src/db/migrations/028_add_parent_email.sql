-- ============================================================================
-- SWIMS Database Schema — 028: Add parent_email to students for counseling
-- ============================================================================
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email TEXT;
