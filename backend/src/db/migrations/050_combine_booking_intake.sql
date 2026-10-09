-- ============================================================================
-- SWIMS — 050: Combine the QR booking flow with the employee-counseling intake
--
-- Before this, the two public flows were completely disconnected:
--   * /book/staff                    -> wrote to `appointments`
--   * /quisioner/employee-counseling -> wrote to `employee_counseling_submissions`
-- A counselor therefore never saw who had booked, and an intake had no schedule.
--
-- This migration links them: an intake can now carry the verified identity of
-- the employee, the appointment it belongs to, and the counselor that owns it.
-- Existing rows are left untouched (booking_status defaults to 'standalone'),
-- so old submissions keep behaving exactly as before.
-- ============================================================================

-- Which intake path produced this row. 'standalone' = the old questionnaire-only
-- link; 'combined' = NIK verified + questionnaire + booked slot in one flow.
ALTER TABLE employee_counseling_submissions
  ADD COLUMN IF NOT EXISTS booking_status TEXT NOT NULL DEFAULT 'standalone'
    CHECK (booking_status IN ('standalone', 'combined'));

-- Verified identity. `employee_user_id` links the intake to the PERSONAL account
-- that owns the appointment, so the counselor sees one real person rather than a
-- free-text name the employee typed. `nik_verified` records that we checked the
-- NIK hash against `users.national_id_hash` — an intake is only marked verified
-- when it did NOT come from the old anonymous form.
ALTER TABLE employee_counseling_submissions
  ADD COLUMN IF NOT EXISTS employee_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE employee_counseling_submissions
  ADD COLUMN IF NOT EXISTS nik_verified BOOLEAN NOT NULL DEFAULT false;

-- The appointment this intake was booked into. ON DELETE SET NULL: if a booking
-- is cancelled the intake must survive — losing the counseling history because
-- someone deleted a calendar slot would be far worse than a dangling schedule.
ALTER TABLE employee_counseling_submissions
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL;

-- Booking moment + the slot's own timestamps, denormalised so the counselor
-- dashboard can sort and display a schedule without joining `appointments`
-- (which is also what lets a cancelled booking be shown without a join).
ALTER TABLE employee_counseling_submissions
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE employee_counseling_submissions
  ADD COLUMN IF NOT EXISTS slot_start TIMESTAMPTZ;

ALTER TABLE employee_counseling_submissions
  ADD COLUMN IF NOT EXISTS slot_end TIMESTAMPTZ;

-- The reverse direction, so a booking can find its intake without a second scan.
-- Partial-unique: an appointment belongs to at most one intake.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ec_submission_appointment
  ON employee_counseling_submissions (appointment_id)
  WHERE appointment_id IS NOT NULL;

-- Counselor dashboard: "my booked clients, urgent first".
CREATE INDEX IF NOT EXISTS idx_ec_sub_counselor_schedule
  ON employee_counseling_submissions (tenant_id, assigned_counselor_id, scheduled_at DESC)
  WHERE deleted_at IS NULL;

-- Public "is this NIK already booked?" pre-check before someone redoes the
-- questionnaire for an existing appointment.
CREATE INDEX IF NOT EXISTS idx_ec_sub_employee_user
  ON employee_counseling_submissions (tenant_id, employee_user_id, submitted_at DESC)
  WHERE deleted_at IS NULL;