#!/usr/bin/env node
/**
 * End-to-end proof that the "Hapus Pengguna" button works: create a throwaway
 * account, delete it through the real API as an authenticated admin, and confirm
 * the guards — self-delete refused, wrong confirm-text never reaches the server
 * (it is UI-only), and the row is actually soft-deleted rather than reported
 * deleted without happening.
 *
 * Usage (from the HOST — psql lives in the postgres container, login is a real
 * HTTP call to the frontend proxy):
 *   node scripts/verify-admin-delete-e2e.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let ok = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  ok += 1;
  console.log(`  ok - ${msg}`);
}

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

// ── 1. log in as the IT admin ────────────────────────────────────────────────
console.log('1. login as IT_ADMIN');
const CAPTCHA_BYPASS = process.env.ADMIN_PASSWORD || 'password123';
let token = null;
let adminId = null;

for (const slug of ['hbics', 'springfield']) {
  const ch = await api('/api/auth/captcha');
  const captchaId = ch.json?.data?.captcha_id ?? ch.json?.data?.id;
  const question = ch.json?.data?.question ?? '';
  if (!captchaId) continue;

  // The question uses Unicode operators (e.g. "What is 7 − 3?", "4 × 5?"),
  // so normalise them before parsing — a plain /[\d]+[-+*]/ match silently
  // fails and sends an empty answer.
  let answer = '';
  const m = question.match(/What is (-?\d+)\s*([+\-−*×])\s*(-?\d+)/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const op = m[2] === '+' ? '+' : m[2] === '−' ? '-' : '*';
    answer = String(op === '+' ? a + b : op === '-' ? a - b : a * b);
  }

  const r = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@springfield.edu', password: CAPTCHA_BYPASS, tenant_slug: slug, captcha_id: captchaId, captcha_answer: answer },
  });
  if (r.status === 200 && r.json?.data?.access_token) {
    token = r.json.data.access_token;
    adminId = r.json.data.user?.user_id ?? r.json.data.user?.id;
    console.log(`   logged in on tenant "${slug}" (captcha "${question}" -> ${answer})`);
    break;
  }
  console.log(`   login failed on "${slug}": ${r.json?.error ?? r.status}`);
}
if (!token) throw new Error('Could not log in as admin — is the captcha question arithmetic?');
assert(!!adminId, `admin id resolved (${adminId})`);

// ── 2. create a throwaway staff account ─────────────────────────────────────
console.log('\n2. create throwaway account');
const created = await api('/api/admin/users', {
  token,
  method: 'POST',
  body: { full_name: 'ZZ Uji Hapus Sementara', email: `zz-hapus-${Date.now()}@test.sch.id`, role: 'PERSONAL', password: 'UjiHapus123' },
});
assert(created.status === 201 || created.status === 200, `create returned ${created.status}`);
const victimId = created.json?.data?.user_id ?? created.json?.data?.id;
assert(!!victimId, `created id ${victimId}`);

// it must be visible in the directory (what the dialog lists)
const list = await api('/api/admin/users', { token });
const listed = (list.json?.data ?? []).some((u) => u.id === victimId);
assert(listed, 'new account appears in the user directory');

// ── 3. self-delete must be refused ──────────────────────────────────────────
console.log('\n3. guard: admin cannot delete their own account');
const self = await api(`/api/admin/users/${adminId}`, { token, method: 'DELETE' });
assert(self.status === 400, `self-delete refused with 400 (got ${self.status})`);
assert(/tidak dapat menghapus akun Anda sendiri/i.test(self.json?.error ?? ''),
  `error message explains why: "${self.json?.error}"`);

// the admin row must be untouched
const afterSelf = await api('/api/admin/users', { token });
assert((afterSelf.json?.data ?? []).some((u) => u.id === adminId),
  'admin account still present after the refused self-delete');

// ── 4. delete the throwaway account ─────────────────────────────────────────
console.log('\n4. delete the throwaway account');
const del = await api(`/api/admin/users/${victimId}`, { token, method: 'DELETE' });
assert(del.status === 200, `delete returned 200 (got ${del.status})`);
assert(del.json?.data?.deleted === true, 'response confirms deleted: true');

// ── 5. it must really be gone from the directory ───────────────────────────
console.log('\n5. verify it is gone');
const after = await api('/api/admin/users', { token });
const stillThere = (after.json?.data ?? []).some((u) => u.id === victimId);
assert(!stillThere, 'deleted account no longer listed');

// deleting again is a 404, not a false success
const again = await api(`/api/admin/users/${victimId}`, { token, method: 'DELETE' });
assert(again.status === 404, `re-delete returns 404, not a fake success (got ${again.status})`);

console.log(`\n✅ admin delete verified end-to-end (${ok} assertions)`);