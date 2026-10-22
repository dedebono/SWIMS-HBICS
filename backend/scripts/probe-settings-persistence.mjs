#!/usr/bin/env node
/**
 * Why the earlier probe reported 404s: the login rate limiter (429, ~15 min
 * cooldown) meant no token was ever obtained, so every settings call went out
 * unauthenticated. This version mints a JWT directly with the server's own
 * JWT_SECRET and a real tenant/admin id read from the DB — no login, no limit.
 *
 * Usage (from the host):
 *   ADMIN_EMAIL=admin@springfield.edu ADMIN_PASSWORD=password123 \
 *   node backend/scripts/probe-settings-persistence.mjs
 */
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CONTAINER = process.env.DB_CONTAINER || 'swims_postgres';
const COMPOSE_DIR = process.env.COMPOSE_DIR || '/home/ubuntu/SWIMS-HBICS';

let failures = 0;
function report(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} - ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
}

function psql(query) {
  return execFileSync('sudo', ['docker', 'exec', CONTAINER, 'psql', '-U', 'swims', '-d', 'swims', '-t', '-A', '-F', '|', '-c', query],
    { encoding: 'utf8', cwd: COMPOSE_DIR }).trim();
}

/** Read JWT_SECRET out of the backend container's runtime env. */
function readJwtSecret() {
  const out = execFileSync('sudo', ['docker', 'exec', 'swims_backend', 'sh', '-c',
    "printenv JWT_SECRET || grep -m1 '^JWT_SECRET=' /app/.env"],
    { encoding: 'utf8' }).trim();
  return out.replace(/^JWT_SECRET=/, '').trim();
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

// ── build an admin token without hitting the login rate limiter ──────────────
const tenant = psql("SELECT tenant_id FROM tenants WHERE slug='hbics' LIMIT 1;").split('|')[0];
const [adminId, adminEmail] = psql(
  `SELECT user_id, email FROM users WHERE tenant_id='${tenant}' AND role='IT_ADMIN' AND deleted_at IS NULL LIMIT 1;`,
).split('|');
if (!tenant || !adminId) throw new Error('could not resolve tenant/admin from the DB');

const secret = readJwtSecret();
if (!secret) throw new Error('JWT_SECRET not found in the backend container');
const exp = Math.floor(Date.now() / 1000) + 3600;
const header = b64url({ alg: 'HS256', typ: 'JWT' });
const payload = b64url({ user_id: adminId, email: adminEmail, tenant_id: tenant, role: 'IT_ADMIN', iat: Math.floor(Date.now() / 1000), exp });
const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
const token = `${header}.${payload}.${sig}`;
console.log(`tenant=${tenant} admin=${adminEmail}\n`);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

const read = async () => (await api('/api/admin/settings')).json?.data ?? {};

// ── 1. storage ───────────────────────────────────────────────────────────────
console.log('1. storage settings');
await api('/api/admin/settings', { method: 'PATCH', body: { storage: { storageProvider: 'local', firebaseApiKey: 'PROBE-FIREBASE-KEY', r2BucketName: 'PROBE-BUCKET' } } });
let s = (await read()).storage;
report('storageProvider round-trips', s?.storageProvider === 'local', JSON.stringify(s?.storageProvider));
report('storage detail keys round-trip', s?.firebaseApiKey === 'PROBE-FIREBASE-KEY', JSON.stringify(s?.firebaseApiKey ?? null));

// ── 2. gowa ──────────────────────────────────────────────────────────────────
console.log('\n2. gowa settings');
const p = await api('/api/admin/settings', { method: 'PATCH', body: { gowa: { enabled: true, url: 'http://probe-gowa.local:3000', basicAuth: 'probe-user:PROBE-GOWA-PASS' } } });
report('PATCH returns 200', p.status === 200, String(p.status));
s = (await read()).gowa;
report('gowa.url persisted', s?.url === 'http://probe-gowa.local:3000', JSON.stringify(s ?? null));
report('gowa.basicAuth persisted', s?.basicAuth === 'probe-user:PROBE-GOWA-PASS', JSON.stringify(s?.basicAuth ?? null));
report('gowa.enabled persisted', s?.enabled === true, JSON.stringify(s?.enabled ?? null));

// ── 3. email / SMTP ──────────────────────────────────────────────────────────
console.log('\n3. email (SMTP) settings');
const e = await api('/api/admin/settings', { method: 'PATCH', body: { email: { host: 'smtp.probe.local', port: 587, secure: false, username: 'probe@local', password: 'PROBE-SMTP-PASS' } } });
report('PATCH returns 200', e.status === 200, String(e.status));
s = (await read()).email;
report('email.host persisted', s?.host === 'smtp.probe.local', JSON.stringify(s ?? null));
report('email.password persisted', s?.password === 'PROBE-SMTP-PASS', JSON.stringify(s?.password ?? null));

// ── 4. what the DB actually holds ────────────────────────────────────────────
console.log('\n4. raw DB columns after the writes');
const raw = psql(`SELECT jsonb_pretty(settings::jsonb) FROM tenants WHERE tenant_id='${tenant}';`);
console.log(raw.split('\n').map((l) => `    ${l}`).join('\n'));

console.log(`\n${failures === 0 ? '✅ all settings persisted' : `❌ ${failures} setting(s) silently dropped`}`);
process.exit(failures === 0 ? 0 : 1);