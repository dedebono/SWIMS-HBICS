import pg from 'pg';
import bcrypt from 'bcryptjs';

/**
 * Seed script: creates sample tenant, users, students, and cases for development.
 */
async function seed(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://swims:swims_dev_password@localhost:5432/swims';
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    // ── Tenant ────────────────────────────────────────────────────────────
    const { rows: tenants } = await client.query<{ tenant_id: string }>(`
      INSERT INTO tenants (name, slug, settings)
      VALUES ('Springfield International School', 'springfield', '{"language_blocklist_enabled": true}')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING tenant_id
    `);
    const tenantId = tenants[0]!.tenant_id;

    console.log(`  ✓ Tenant: ${tenantId} (springfield)`);

    // ── Users ─────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('password123', 12);

    const users = [
      { full_name: 'Dr. Sarah Chen', email: 'sarah.chen@springfield.edu', role: 'COUNSELOR' },
      { full_name: 'James Wilson', email: 'james.wilson@springfield.edu', role: 'TEACHER' },
      { full_name: 'Maria Garcia', email: 'maria.garcia@springfield.edu', role: 'SCHOOL_HEAD' },
      { full_name: 'Nurse Pat', email: 'pat@springfield.edu', role: 'SCHOOL_NURSE' },
      { full_name: 'Admin User', email: 'admin@springfield.edu', role: 'IT_ADMIN' },
      { full_name: 'Board Member', email: 'board@springfield.edu', role: 'BOARD_MEMBER' },
    ];

    const userIds: string[] = [];
    for (const u of users) {
      const { rows } = await client.query<{ user_id: string }>(`
        INSERT INTO users (tenant_id, full_name, email, password_hash, role)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, email) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING user_id
      `, [tenantId, u.full_name, u.email, passwordHash, u.role]);
      userIds.push(rows[0]!.user_id);
      console.log(`  ✓ User: ${u.full_name} (${u.role}) — ${rows[0]!.user_id}`);
    }

    const [counselorId, teacherId] = userIds as [string, string, ...string[]];

    // ── Students ──────────────────────────────────────────────────────────
    const students = [
      { full_name: 'Alex Johnson', dob: '2012-03-15', gender: 'Male', qr: 'STU-001' },
      { full_name: 'Bella Martinez', dob: '2011-07-22', gender: 'Female', qr: 'STU-002' },
      { full_name: 'Charlie Kim', dob: '2013-11-08', gender: 'Male', qr: 'STU-003' },
      { full_name: 'Diana Patel', dob: '2012-09-30', gender: 'Female', qr: 'STU-004' },
      { full_name: 'Ethan Williams', dob: '2011-01-14', gender: 'Male', qr: 'STU-005' },
    ];

    const studentIds: string[] = [];
    for (const s of students) {
      const { rows } = await client.query<{ student_id: string }>(`
        INSERT INTO students (tenant_id, full_name, date_of_birth, gender, qr_code)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (qr_code) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING student_id
      `, [tenantId, s.full_name, s.dob, s.gender, s.qr]);
      studentIds.push(rows[0]!.student_id);
      console.log(`  ✓ Student: ${s.full_name} — ${rows[0]!.student_id}`);
    }

    // ── Enrollment ────────────────────────────────────────────────────────
    for (const sid of studentIds) {
      await client.query(`
        INSERT INTO student_enrollment_history (student_id, tenant_id, school_level, school_phase, class_name, academic_year, enrolled_at)
        VALUES ($1, $2, 'SECONDARY', 'Grade 8', '8A', '2025/2026', '2025-08-01')
        ON CONFLICT DO NOTHING
      `, [sid, tenantId]);
    }

    // ── Teacher Class Assignment ──────────────────────────────────────────
    await client.query(`
      INSERT INTO teacher_class_assignments (tenant_id, user_id, class_name, academic_year)
      VALUES ($1, $2, '8A', '2025/2026')
      ON CONFLICT DO NOTHING
    `, [tenantId, teacherId]);

    // ── Sample Cases ──────────────────────────────────────────────────────
    const { rows: cases } = await client.query<{ case_id: string }>(`
      INSERT INTO cases (tenant_id, student_id, case_type, status, risk_level, assigned_counselor, school_phase_ref, created_by)
      VALUES
        ($1, $2, 'BEHAVIORAL', 'OPEN', 'MEDIUM', $4, 'Grade 8', $5),
        ($1, $3, 'EMOTIONAL', 'OPEN', 'HIGH', $4, 'Grade 8', $5),
        ($1, $2, 'POSITIVE', 'OPEN', 'LOW', NULL, 'Grade 8', $5)
      RETURNING case_id
    `, [tenantId, studentIds[0], studentIds[1], counselorId, teacherId]);

    console.log(`  ✓ Cases: ${cases.map(c => c.case_id).join(', ')}`);

    // ── Sample Incidents ──────────────────────────────────────────────────
    if (cases[0]) {
      await client.query(`
        INSERT INTO incidents (tenant_id, case_id, student_id, category, severity, description, location, incident_at, reported_by)
        VALUES
          ($1, $2, $3, 'Aggression', 'MEDIUM', 'Student was involved in a verbal altercation during recess.', 'Playground', NOW() - INTERVAL '5 days', $4),
          ($1, $2, $3, 'Disruption', 'LOW', 'Student disrupted class by talking repeatedly during instruction.', 'Classroom 8A', NOW() - INTERVAL '2 days', $4)
      `, [tenantId, cases[0].case_id, studentIds[0], teacherId]);
    }

    if (cases[1]) {
      await client.query(`
        INSERT INTO incidents (tenant_id, case_id, student_id, category, severity, description, location, incident_at, reported_by)
        VALUES
          ($1, $2, $3, 'Withdrawal', 'HIGH', 'Student has been increasingly isolated and refusing to participate in group activities.', 'Classroom', NOW() - INTERVAL '3 days', $4)
      `, [tenantId, cases[1].case_id, studentIds[1], counselorId]);
    }

    // ── Positive Observation ──────────────────────────────────────────────
    await client.query(`
      INSERT INTO positive_observations (tenant_id, student_id, case_id, recorded_by, category, description, observed_at)
      VALUES ($1, $2, $3, $4, 'Leadership', 'Alex volunteered to help organize the classroom library without being asked.', NOW() - INTERVAL '1 day')
    `, [tenantId, studentIds[0], cases[2]?.case_id, teacherId]);

    await client.query('COMMIT');
    console.log('\n✅ Seed data created successfully.');
    console.log('\n📋 Login credentials:');
    console.log('   Tenant slug: springfield');
    console.log('   Any user email with password: password123');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
