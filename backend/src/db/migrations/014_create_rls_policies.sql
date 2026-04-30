-- ============================================================================
-- SWIMS Database Schema — 014: Row-Level Security Policies
-- ============================================================================
-- RLS is enabled on ALL tables EXCEPT audit_logs and tenants.
-- Each policy ensures tenant_id = current_setting('app.tenant_id')::UUID
-- The app sets this session variable per request via SET LOCAL.
-- ============================================================================

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_users_mod ON users
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- students
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_students ON students
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_students_mod ON students
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- student_enrollment_history
ALTER TABLE student_enrollment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_enrollment ON student_enrollment_history
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_enrollment_mod ON student_enrollment_history
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- cases
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cases ON cases
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_cases_mod ON cases
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- incidents
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_incidents ON incidents
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_incidents_mod ON incidents
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- interventions
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_interventions ON interventions
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_interventions_mod ON interventions
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- media_assets
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_media ON media_assets
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_media_mod ON media_assets
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- consents
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_consents ON consents
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_consents_mod ON consents
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- alerts
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_alerts ON alerts
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_alerts_mod ON alerts
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- positive_observations
ALTER TABLE positive_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_observations ON positive_observations
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_observations_mod ON positive_observations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- substitution_schedule
ALTER TABLE substitution_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_substitution ON substitution_schedule
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_substitution_mod ON substitution_schedule
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- teacher_class_assignments
ALTER TABLE teacher_class_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tca ON teacher_class_assignments
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_tca_mod ON teacher_class_assignments
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);
