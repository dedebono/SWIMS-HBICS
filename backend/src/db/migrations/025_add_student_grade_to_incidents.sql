-- ============================================================================
-- SWIMS Database Schema — 025: Add student_grade to incidents
-- ============================================================================
-- Free-text grade the user fills in manually. Spans kindergarten to senior
-- grade (e.g. "KG-A", "Grade 5", "Grade 12"), so a free-text field is used
-- rather than a fixed enum to remain education-system agnostic.

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS student_grade TEXT;

COMMENT ON COLUMN incidents.student_grade IS 'Free-text student grade filled manually by the reporter (e.g. KG-A, Grade 5, Grade 12). Spans kindergarten to senior grade.';
