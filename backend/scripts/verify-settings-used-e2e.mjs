/**
 * Proves the saved settings are actually USED, not just stored: point GOWA at a
 * local listener, save that URL through the real settings API, then trigger a
 * WhatsApp send and assert the request arrived at the saved host with the saved
 * Basic-Auth credentials and the GOWA payload shape.
 *
 * Also asserts email/AI settings are visible to their readers.
 *
 *   sudo docker cp backend/scripts/verify-settings-used-e2e.mjs swims_backend:/app/scripts/
 *   sudo docker exec -e TENANT_ID=... -e TENANT_SLUG=hbics swims_backend node /app/scripts/verify-settings-used-e2e.mjs
 */
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const FRONTEND = process.env.FRONTEND_URL || 'http://frontend:3000';
const PROBE_PORT = 39731;

let ok = 0;
function assert(cond, msg) {
  console.log(`  ${cond ? 'ok  -' : 'FAIL-'} ${msg}`);
  if (cond) ok += 1;
}

// ── a listener that records whatever GOWA sends it ────────────────────────────
const received = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    received.push({ url: req.url, headers: req.headers, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'SUCCESS', message: 'probe', results: { message_id: 'probe-msg-1', status: 'sent' } }));
  });
});
await new Promise((r) => server.listen(PROBE_PORT, '127.0.0.1', r));
console.log(`probe listener on 127.0.0.1:${PROBE_PORT}\n`);

// ── auth token minted locally (the login rate limiter blocks repeated logins) ─
// psql lives in the postgres container, not here, so the caller passes the ids in.
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET env required');
const tenant = process.env.TENANT_ID;
const adminId = process.env.ADMIN_ID;
const adminEmail = process.env.ADMIN_EMAIL ?? '';
if (!tenant || !adminId) throw new Error('TENANT_ID and ADMIN_ID env required');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b64({ alg: 'HS256', typ: 'JWT' });
const p = b64({ user_id: adminId, email: adminEmail, tenant_id: tenant, role: 'IT_ADMIN', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
const token = `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;

const api = async (path, { method = 'GET', body } = {}) => {
  const r = await fetch(`${FRONTEND}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

// ── 1. save GOWA pointing at the probe ──────────────────────────────────────
console.log('1. save gowa settings pointing at the probe listener');
const before = await api('/admin/settings');
const prior = before.json?.data?.gowa ?? {};

const save = await api('/admin/settings', {
  method: 'PATCH',
  body: { gowa: { enabled: true, url: `http://127.0.0.1:${PROBE_PORT}`, basicAuth: 'probe-user:PROBE-GOWA-PASS' } },
});
assert(save.status === 200, `PATCH 200 (got ${save.status})`);

const after = await api('/admin/settings');
assert(after.json?.data?.gowa?.url === `http://127.0.0.1:${PROBE_PORT}`, 'url read back from the API');
assert(after.json?.data?.gowa?.basicAuth === 'probe-user:PROBE-GOWA-PASS', 'basic auth read back from the API');

// ── 2. trigger a send and see where it actually goes ────────────────────────
console.log('\n2. send a WhatsApp message and inspect the destination');
// The container runs the backend from TypeScript via tsx (no dist/ is built),
// so import the services through tsx's loader rather than /app/dist/*.js.
const { sendWhatsAppMessage } = await import('../src/services/notifications.service.js');
const res = await sendWhatsAppMessage(tenant, { chatId: '628123456789', text: 'probe' });

assert(res.success === true, 'sendWhatsAppMessage reported success');
assert(received.length === 1, `probe listener received exactly 1 request (got ${received.length})`);
const req = received[0];
assert(Boolean(req), 'a request reached the saved host');
assert(req?.url === '/send/message', `hit /send/message (got ${req?.url})`);
const sentAuth = req?.headers?.authorization ?? '';
assert(
  sentAuth === `Basic ${Buffer.from('probe-user:PROBE-GOWA-PASS').toString('base64')}`,
  'sent the saved Basic-Auth credentials',
);
const sentBody = JSON.parse(req?.body || '{}');
assert(sentBody.phone === '628123456789', `sent the recipient as "phone" (got ${sentBody.phone})`);
assert(sentBody.message === 'probe', 'sent the text as "message"');
assert(!('chatId' in sentBody) && !('session' in sentBody), 'no leftover WAHA fields in the payload');

// ── 3. email + AI are readable by their services ───────────────────────────
console.log('\n3. email and AI settings are visible to their readers');
const emailSave = await api('/admin/settings', {
  method: 'PATCH',
  body: { email: { host: 'smtp.probe.local', port: 465, secure: true, username: 'u', password: 'p' } },
});
assert(emailSave.status === 200, 'email saved');

// This process has its OWN module instance of tenant-settings.service, with its
// own 30s cache. The API server (a different process) already invalidated its
// cache when it handled the PATCH, so ours can still hold a value from before
// this run. Drop it so the read reflects what was just written.
const { invalidateTenantSettings, clearTenantSettingsCache } = await import('../src/services/tenant-settings.service.js');
clearTenantSettingsCache();
invalidateTenantSettings(tenant);

const emailSvc = await import('../src/services/email.service.js');
const email = await emailSvc.getTenantEmailSettings(tenant);
assert(email?.host === 'smtp.probe.local', `getTenantEmailSettings returns the saved host (got ${email?.host})`);
assert(typeof email?.port === 'number' && email.port === 465, `port came back as the number 465 (got ${JSON.stringify(email?.port)} of type ${typeof email?.port})`);

const ai = after.json?.data?.ai ?? {};
assert('enabled' in ai, `AI settings use the field the service reads ("enabled"), got keys: ${Object.keys(ai).join(',')}`);

// ── restore ─────────────────────────────────────────────────────────────────
await api('/admin/settings', {
  method: 'PATCH',
  body: { gowa: Object.fromEntries(Object.entries(prior).filter(([, v]) => v !== undefined && v !== null)) },
});
await api('/admin/settings', { method: 'PATCH', body: { email: { host: '', port: 0, secure: false, username: '', password: '' } } });
server.close();

console.log(`\n${ok === 15 ? '✅ settings are stored AND used' : `⚠️  ${ok}/15 assertions passed`}`);
process.exit(ok === 15 ? 0 : 1);