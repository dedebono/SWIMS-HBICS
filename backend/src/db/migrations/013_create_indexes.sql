-- ============================================================================
-- SWIMS Database Schema — 013: Indexes
-- ============================================================================

-- Foreign key indexes (PostgreSQL does NOT auto-create these)
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_students_tenant_id ON students(tenant_id);
CREATE INDEX idx_student_enrollment_student_id ON student_enrollment_history(student_id);
CREATE INDEX idx_student_enrollment_tenant_id ON student_enrollment_history(tenant_id);
CREATE INDEX idx_cases_student_id ON cases(student_id);
CREATE INDEX idx_cases_assigned_counselor ON cases(assigned_counselor);
CREATE INDEX idx_cases_created_by ON cases(created_by);
CREATE INDEX idx_incidents_case_id ON incidents(case_id);
CREATE INDEX idx_incidents_student_id ON incidents(student_id);
CREATE INDEX idx_incidents_reported_by ON incidents(reported_by);
CREATE INDEX idx_interventions_case_id ON interventions(case_id);
CREATE INDEX idx_interventions_incident_id ON interventions(incident_id);
CREATE INDEX idx_interventions_created_by ON interventions(created_by);
CREATE INDEX idx_media_assets_incident_id ON media_assets(incident_id);
CREATE INDEX idx_media_assets_case_id ON media_assets(case_id);
CREATE INDEX idx_media_assets_uploader_id ON media_assets(uploader_id);
CREATE INDEX idx_consents_student_id ON consents(student_id);
CREATE INDEX idx_consents_tenant_id ON consents(tenant_id);
CREATE INDEX idx_alerts_student_id ON alerts(student_id);
CREATE INDEX idx_alerts_assigned_to ON alerts(assigned_to);
CREATE INDEX idx_positive_observations_student_id ON positive_observations(student_id);
CREATE INDEX idx_positive_observations_case_id ON positive_observations(case_id);
CREATE INDEX idx_positive_observations_recorded_by ON positive_observations(recorded_by);

-- Composite indexes per specification
CREATE INDEX idx_cases_tenant_student_status ON cases(tenant_id, student_id, status);
CREATE INDEX idx_incidents_tenant_case_severity ON incidents(tenant_id, case_id, severity);
CREATE INDEX idx_incidents_tenant_incident_at ON incidents(tenant_id, incident_at);
CREATE INDEX idx_alerts_tenant_status_expires ON alerts(tenant_id, status, expires_at);
CREATE INDEX idx_audit_logs_tenant_entity ON audit_logs(tenant_id, entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Additional useful indexes
CREATE INDEX idx_cases_tenant_id ON cases(tenant_id);
CREATE INDEX idx_incidents_tenant_id ON incidents(tenant_id);
CREATE INDEX idx_interventions_tenant_id ON interventions(tenant_id);
CREATE INDEX idx_media_assets_tenant_id ON media_assets(tenant_id);
CREATE INDEX idx_alerts_tenant_id ON alerts(tenant_id);
CREATE INDEX idx_positive_observations_tenant_id ON positive_observations(tenant_id);

-- ABAC support indexes
CREATE INDEX idx_teacher_class_assignments_user ON teacher_class_assignments(tenant_id, user_id);
CREATE INDEX idx_substitution_schedule_substitute ON substitution_schedule(tenant_id, substitute_id);
CREATE INDEX idx_substitution_schedule_dates ON substitution_schedule(start_date, end_date);

-- Soft-delete filtering (partial indexes for active records)
CREATE INDEX idx_cases_active ON cases(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_active ON incidents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_active ON students(tenant_id) WHERE deleted_at IS NULL;
