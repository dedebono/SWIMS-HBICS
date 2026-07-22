import { pool, getClientWithTenant } from '../db/pool.js';
import bcrypt from 'bcryptjs';
import { Role as SharedRole } from '@swims/shared';
import { ValidationError } from '../utils/errors.js';
import { encryptField, decryptField, hashNationalId } from '../utils/encryption.js';

// Extend Role to include STUDENT for admin users service
type Role = 'STUDENT' | SharedRole;

export interface CreateUserData {
  full_name: string;
  email: string;
  role: Role;
  national_id?: string;
  gender?: string;
  password?: string;
}

const DEFAULT_PASSWORD = 'Welcome123!';

/**
 * Creates a single user manually.
 */
export async function createUser(tenantId: string, data: CreateUserData): Promise<{ user_id: string }> {
  const client = await getClientWithTenant(tenantId);
  try {
    const emailLower = data.email.toLowerCase();

    // 1. Check for duplicate email in users table
    const { rowCount: userCount } = await client.query(
      `SELECT 1 FROM users WHERE tenant_id = $1 AND email = $2`,
      [tenantId, emailLower]
    );
    if (userCount && userCount > 0) {
      throw new ValidationError('A user with this email already exists.');
    }

    // 2. Check for duplicate email in students table
    const { rowCount: studentEmailCount } = await client.query(
      `SELECT 1 FROM students WHERE tenant_id = $1 AND metadata->>'email' = $2`,
      [tenantId, emailLower]
    );
    if (studentEmailCount && studentEmailCount > 0) {
      throw new ValidationError('A student with this email already exists.');
    }

    // 3. Check for duplicate national_id for students (using hash)
    if (data.role === 'STUDENT' && data.national_id) {
      const nationalIdHash = hashNationalId(data.national_id);

      const { rowCount: duplicateCount } = await client.query(
        `SELECT 1 FROM students WHERE tenant_id = $1 AND national_id_hash = $2 AND deleted_at IS NULL`,
        [tenantId, nationalIdHash]
      );
      if (duplicateCount && duplicateCount > 0) {
        throw new ValidationError('A student with this National ID / Student ID already exists.');
      }
    }

    if (data.role === 'STUDENT') {
      const encryptedNationalId = data.national_id ? encryptField(data.national_id) : null;
      const nationalIdHash = data.national_id ? hashNationalId(data.national_id) : null;

      const { rows } = await client.query<{ student_id: string }>(
        `INSERT INTO students (tenant_id, full_name, national_id, national_id_hash, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING student_id`,
        [tenantId, data.full_name, encryptedNationalId, nationalIdHash, JSON.stringify({ email: emailLower })]
      );

      return { user_id: rows[0]!.student_id };
    } else {
      const passwordToUse = data.password || DEFAULT_PASSWORD;
      const passwordHash = await bcrypt.hash(passwordToUse, 12);

      const { rows } = await client.query<{ user_id: string }>(
        `INSERT INTO users (tenant_id, full_name, email, password_hash, role, gender)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING user_id`,
        [tenantId, data.full_name, emailLower, passwordHash, data.role, data.gender ?? null]
      );

      return { user_id: rows[0]!.user_id };
    }
  } finally {
    client.release();
  }
}

/**
 * Creates multiple users from bulk CSV import.
 */
export async function createUsersBulk(tenantId: string, users: CreateUserData[]): Promise<{ created: number, duplicates: number, failed: number }> {
  if (!users.length) return { created: 0, duplicates: 0, failed: 0 };

  let createdCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;

  for (const user of users) {
    try {
      // Reuse the single user creation logic for consistency and validation
      await createUser(tenantId, user);
      createdCount++;
    } catch (error: any) {
      if (error.name === 'ValidationError' && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
        duplicateCount++;
      } else {
        // Skip any other problematic row (bad data, constraint error, etc.)
        // and keep processing the rest of the batch instead of aborting.
        failedCount++;
        console.error(`[Bulk Import] Skipped row for "${user.email}":`, error?.message || error);
      }
    }
  }

  return { created: createdCount, duplicates: duplicateCount, failed: failedCount };
}

/**
 * Lists all users and students for the directory.
 */
export async function getAllUsers(tenantId: string) {
  const client = await getClientWithTenant(tenantId);
  try {
    const { rows: staff } = await client.query(
      `SELECT user_id as id, full_name, email, role, gender, is_active, created_at, 'STAFF' as type
       FROM users 
       WHERE tenant_id = $1 
       ORDER BY full_name ASC`,
      [tenantId]
    );

    const { rows: students } = await client.query(
      `SELECT student_id as id, full_name, metadata->>'email' as email, 'STUDENT' as role, true as is_active, created_at, 'STUDENT' as type, national_id
       FROM students
       WHERE tenant_id = $1
       ORDER BY full_name ASC`,
       [tenantId]
    );

    const decryptedStudents = students.map(s => {
      let nationalId = '—';
      if (s.national_id) {
        try {
          nationalId = decryptField(s.national_id);
        } catch (e) {
          nationalId = '[Encrypted]';
        }
      }
      const { national_id, ...rest } = s;
      return { ...rest, national_id: nationalId };
    });

    return [...staff, ...decryptedStudents].sort((a, b) => a.full_name.localeCompare(b.full_name));
  } finally {
    client.release();
  }
}

/**
 * Updates an existing user or student.
 * For staff: updates full_name, email, role, is_active, and optionally password.
 * For students: updates full_name, national_id.
 */
export interface UpdateUserData {
  full_name?: string;
  email?: string;
  role?: Role;
  national_id?: string;
  gender?: string;
  is_active?: boolean;
  password?: string;
}

export async function updateUser(
  tenantId: string,
  userId: string,
  data: UpdateUserData,
): Promise<{ user_id: string }> {
  const client = await getClientWithTenant(tenantId);
  try {
    // Determine if this is a staff user or student
    const { rows: staffRows } = await client.query<{ user_id: string }>(
      `SELECT user_id FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    if (staffRows.length > 0) {
      // === STAFF USER ===
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.full_name !== undefined) {
        updates.push(`full_name = $${paramIndex++}`);
        values.push(data.full_name);
      }
      if (data.email !== undefined) {
        const emailLower = data.email.toLowerCase();
        // Check for duplicate email (excluding self)
        const { rowCount } = await client.query(
          `SELECT 1 FROM users WHERE tenant_id = $1 AND email = $2 AND user_id != $3`,
          [tenantId, emailLower, userId]
        );
        if (rowCount && rowCount > 0) {
          throw new ValidationError('A user with this email already exists.');
        }
        updates.push(`email = $${paramIndex++}`);
        values.push(emailLower);
      }
      if (data.role !== undefined) {
        updates.push(`role = $${paramIndex++}`);
        values.push(data.role);
      }
      if (data.gender !== undefined) {
        updates.push(`gender = $${paramIndex++}`);
        values.push(data.gender ?? null);
      }
      if (data.is_active !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(data.is_active);
      }
      if (data.password !== undefined) {
        const passwordHash = await bcrypt.hash(data.password, 12);
        updates.push(`password_hash = $${paramIndex++}`);
        values.push(passwordHash);
      }

      if (updates.length === 0) {
        throw new ValidationError('No fields to update.');
      }

      values.push(userId, tenantId);
      await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE user_id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
        values
      );

      return { user_id: userId };
    }

    // === STUDENT ===
    const { rows: studentRows } = await client.query<{ student_id: string }>(
      `SELECT student_id FROM students WHERE student_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    if (studentRows.length > 0) {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.full_name !== undefined) {
        updates.push(`full_name = $${paramIndex++}`);
        values.push(data.full_name);
      }
      if (data.national_id !== undefined) {
        const encryptedNationalId = data.national_id ? encryptField(data.national_id) : null;
        updates.push(`national_id = $${paramIndex++}`);
        values.push(encryptedNationalId);
      }

      if (updates.length === 0) {
        throw new ValidationError('No fields to update.');
      }

      values.push(userId, tenantId);
      await client.query(
        `UPDATE students SET ${updates.join(', ')} WHERE student_id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
        values
      );

      return { user_id: userId };
    }

    throw new ValidationError('User not found.');
  } finally {
    client.release();
  }
}
