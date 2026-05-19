import { pool, getClientWithTenant } from '../db/pool.js';
import bcrypt from 'bcryptjs';
import { Role } from '@swims/shared';
import { BadRequestError } from '../utils/errors.js';
import { encryptField, decryptField } from '../utils/encryption.js';

export interface CreateUserData {
  full_name: string;
  email: string;
  role: Role;
  national_id?: string;
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
      throw new BadRequestError('A user with this email already exists.');
    }

    // 2. Check for duplicate email in students table
    const { rowCount: studentEmailCount } = await client.query(
      `SELECT 1 FROM students WHERE tenant_id = $1 AND metadata->>'email' = $2`,
      [tenantId, emailLower]
    );
    if (studentEmailCount && studentEmailCount > 0) {
      throw new BadRequestError('A student with this email already exists.');
    }

    // 3. Check for duplicate national_id for students (decryption required since ciphertext is random)
    if (data.role === 'STUDENT' && data.national_id) {
      const { rows: existingStudents } = await client.query<{ student_id: string, national_id: string }>(
        `SELECT student_id, national_id FROM students WHERE tenant_id = $1 AND national_id IS NOT NULL`,
        [tenantId]
      );
      
      for (const st of existingStudents) {
        try {
          const decryptedId = decryptField(st.national_id);
          if (decryptedId === data.national_id) {
            throw new BadRequestError('A student with this National ID / Student ID already exists.');
          }
        } catch (e) {
          // ignore decryption errors for old/invalid data
        }
      }
    }

    if (data.role === 'STUDENT') {
      const encryptedNationalId = data.national_id ? encryptField(data.national_id) : null;
      
      const { rows } = await client.query<{ student_id: string }>(
        `INSERT INTO students (tenant_id, full_name, national_id, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING student_id`,
        [tenantId, data.full_name, encryptedNationalId, JSON.stringify({ email: emailLower })]
      );
      
      return { user_id: rows[0]!.student_id };
    } else {
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
      
      const { rows } = await client.query<{ user_id: string }>(
        `INSERT INTO users (tenant_id, full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id`,
        [tenantId, data.full_name, emailLower, passwordHash, data.role]
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
export async function createUsersBulk(tenantId: string, users: CreateUserData[]): Promise<{ created: number, duplicates: number }> {
  if (!users.length) return { created: 0, duplicates: 0 };

  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');
    
    // Pre-fetch existing emails and national IDs to prevent duplicates efficiently
    const existingEmails = new Set<string>();
    const existingNationalIds = new Set<string>();

    const { rows: staffEmails } = await client.query('SELECT email FROM users WHERE tenant_id = $1', [tenantId]);
    for (const r of staffEmails) existingEmails.add(r.email);

    const { rows: studentData } = await client.query('SELECT metadata->>\'email\' as email, national_id FROM students WHERE tenant_id = $1', [tenantId]);
    for (const r of studentData) {
      if (r.email) existingEmails.add(r.email);
      if (r.national_id) {
        try {
          existingNationalIds.add(decryptField(r.national_id));
        } catch (e) {
          // ignore invalid decryption
        }
      }
    }

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    let createdCount = 0;
    let duplicateCount = 0;

    for (const user of users) {
      const emailLower = user.email.toLowerCase();
      
      // Check for duplicates
      if (existingEmails.has(emailLower)) {
        duplicateCount++;
        continue;
      }
      
      if (user.role === 'STUDENT' && user.national_id && existingNationalIds.has(user.national_id)) {
        duplicateCount++;
        continue;
      }

      if (user.role === 'STUDENT') {
        const encryptedNationalId = user.national_id ? encryptField(user.national_id) : null;
        
        await client.query(
          `INSERT INTO students (tenant_id, full_name, national_id, metadata)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, user.full_name, encryptedNationalId, JSON.stringify({ email: emailLower })]
        );
        createdCount++;
        existingEmails.add(emailLower);
        if (user.national_id) existingNationalIds.add(user.national_id);
      } else {
        await client.query(
          `INSERT INTO users (tenant_id, full_name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, user.full_name, emailLower, passwordHash, user.role]
        );
        createdCount++;
        existingEmails.add(emailLower);
      }
    }

    await client.query('COMMIT');
    return { created: createdCount, duplicates: duplicateCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists all users and students for the directory.
 */
export async function getAllUsers(tenantId: string) {
  const client = await getClientWithTenant(tenantId);
  try {
    const { rows: staff } = await client.query(
      `SELECT user_id as id, full_name, email, role, is_active, created_at, 'STAFF' as type
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
