-- ============================================================================
-- SWIMS Database Schema 019: Add involved_teacher to incidents
-- ============================================================================

ALTER TABLE incidents
  ADD COLUMN involved_teacher UUID REFERENCES users(user_id) ON DELETE SET NULL;

COMMENT ON COLUMN incidents.involved_teacher IS 'Optional reference to a teacher involved in the incident';
