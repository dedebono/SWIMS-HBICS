-- ============================================================================
-- SWIMS Database Schema — 015: Audit Role (INSERT-only on audit_logs)
-- ============================================================================
-- The application uses a separate DB role for writing audit_logs.
-- This role can ONLY INSERT into audit_logs — no SELECT, UPDATE, DELETE.
-- The main application role (swims) bypasses RLS as table owner.
-- ============================================================================

-- Create the audit-only role (if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'swims_audit') THEN
    CREATE ROLE swims_audit WITH LOGIN PASSWORD 'swims_audit_password';
  END IF;
END
$$;

-- Grant connect to the database
GRANT CONNECT ON DATABASE swims TO swims_audit;

-- Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO swims_audit;

-- Grant INSERT-only on audit_logs
GRANT INSERT ON audit_logs TO swims_audit;

-- Revoke any broader permissions (defense in depth)
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM swims_audit;

-- The main 'swims' role needs to bypass RLS for admin operations
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
ALTER TABLE cases FORCE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE interventions FORCE ROW LEVEL SECURITY;
ALTER TABLE media_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
ALTER TABLE positive_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE student_enrollment_history FORCE ROW LEVEL SECURITY;
ALTER TABLE substitution_schedule FORCE ROW LEVEL SECURITY;
ALTER TABLE teacher_class_assignments FORCE ROW LEVEL SECURITY;
