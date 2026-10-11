/**
 * Diagnose why a PATCH restore was rejected, without printing secrets.
 */
const { loadDbConfig } = await import('./load-db-config.mjs');
const { Pool } = await import('pg');
const jwt = (await import('jsonwebtoken')).default;

const pool = new Pool(loadDbConfig());
const API = 'http://localhost:4000/api';

const { rows } = await pool.query(
  `SELECT u.user_id, u.tenant_id, u.role FROM users u
   WHERE u.role='IT_ADMIN' AND u.deleted_at IS NULL LIMIT 1`,
);
const u = rows[0];
const token = jwt.sign(
  { user_id: u.user_id, tenant_id: u.tenant_id, role: u.role, email: 'probe@local' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' },
);

const current = await pool.query(
  `SELECT settings->'storage' AS storage FROM tenants WHERE tenant_id=$1`,
  [u.tenant_id],
);
console.log('current storage keys:', Object.keys(current.rows[0].storage ?? {}));

// Try restoring the real working S3 config. Values come from process env so
// nothing sensitive is written into this file.
const body = {
  storage: {
    provider: 's3',
    bucket: process.env.RESTORE_BUCKET,
    region: process.env.RESTORE_REGION,
    accessKey: process.env.RESTORE_ACCESS_KEY,
    secretKey: process.env.RESTORE_SECRET_KEY,
  },
};

const res = await fetch(`${API}/admin/settings`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
const parsed = await res.json().catch(() => ({}));
console.log('PATCH status:', res.status);
console.log('PATCH body:', JSON.stringify(parsed).slice(0, 300));

const after = await pool.query(
  `SELECT settings->'storage'->>'provider' AS provider,
          settings->'storage'->>'bucket' AS bucket
   FROM tenants WHERE tenant_id=$1`,
  [u.tenant_id],
);
console.log('after restore:', JSON.stringify(after.rows[0]));

await pool.end();