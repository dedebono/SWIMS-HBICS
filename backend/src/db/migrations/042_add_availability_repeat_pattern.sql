-- ============================================================================
-- SWIMS Database Schema — 042: Add recurring availability slot support
-- Adds repeat_pattern, repeat_day, repeat_time, parent_slot_id to availability_slots
-- ============================================================================

ALTER TABLE availability_slots
  ADD COLUMN IF NOT EXISTS repeat_pattern TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS repeat_day    INTEGER DEFAULT NULL,  -- 0=Sun..6=Sat (for weekly/biweekly)
  ADD COLUMN IF NOT EXISTS repeat_time    TIME DEFAULT NULL,     -- HH:MM of the slot start time
  ADD COLUMN IF NOT EXISTS parent_slot_id  UUID DEFAULT NULL REFERENCES availability_slots(slot_id);

COMMENT ON COLUMN availability_slots.repeat_pattern IS 'weekly|biweekly|monthly|null';
COMMENT ON COLUMN availability_slots.repeat_day     IS 'Day-of-week index 0=Sun..6=Sat';
COMMENT ON COLUMN availability_slots.repeat_time   IS 'Time portion of the recurring slot';
COMMENT ON COLUMN availability_slots.parent_slot_id  IS 'Points to the template slot for recurring instances';
