import { pool } from '../db/pool.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export async function registerTenant(
  tenantName: string,
  slug: string,
  adminName: string,
  adminEmail: string,
  adminPassword: string
): Promise<{ tenantId: string; userId: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check if slug exists
    const existingSlug = await client.query('SELECT tenant_id FROM tenants WHERE slug = $1', [slug]);
    if (existingSlug.rowCount && existingSlug.rowCount > 0) {
      throw new Error('Tenant slug is already taken');
    }

    // 2. Check if email exists
    const existingEmail = await client.query('SELECT user_id FROM users WHERE email = $1', [adminEmail]);
    if (existingEmail.rowCount && existingEmail.rowCount > 0) {
      throw new Error('Email is already in use');
    }

    // 3. Insert tenant with default settings
    const defaultSettings = {
      ai: {
        aiEnabled: false,
        aiApiUrl: '',
        aiApiKey: ''
      },
      storage: {
        storageProvider: 's3' // Can be firebase, cloudflare_r2, google_drive, s3
      }
    };

    const tenantRes = await client.query(
      `INSERT INTO tenants (name, slug, settings)
       VALUES ($1, $2, $3)
       RETURNING tenant_id`,
      [tenantName, slug, JSON.stringify(defaultSettings)]
    );
    const tenantId = tenantRes.rows[0].tenant_id;

    // 4. Insert IT_ADMIN user
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const userRes = await client.query(
      `INSERT INTO users (tenant_id, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id`,
      [tenantId, adminName, adminEmail, passwordHash, 'IT_ADMIN']
    );
    const userId = userRes.rows[0].user_id;

    await client.query('COMMIT');
    return { tenantId, userId };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
