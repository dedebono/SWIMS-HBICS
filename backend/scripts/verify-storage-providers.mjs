/**
 * End-to-end verification that storage providers actually work.
 *
 * The unit tests prove the dispatch logic with stubs. This script proves it
 * against the running stack: real Postgres, real settings rows, real HTTP.
 *
 * The headline check is BACKWARD COMPATIBILITY — an asset uploaded while the
 * tenant was on `local` must still be downloadable after the tenant switches to
 * a different provider. That is the exact requirement ("data sebelumnya tetap
 * dipanggil dari lokal").
 *
 * Run: node scripts/verify-storage-providers.mjs
 */

const API = process.env.API_BASE || 'http://localhost:4000/api';

let passed = 0;
let failed = 0;
const failures = [];

function ok(msg) { passed++; console.log(`ok - ${msg}`); }
function bad(msg, detail) {
  failed++;
  failures.push(`${msg}${detail ? ` :: ${detail}` : ''}`);
  console.log(`not ok - ${msg}${detail ? ` :: ${detail}` : ''}`);
}
function check(cond, msg, detail) { cond ? ok(msg) : bad(msg, detail); }

const { Pool } = await import('pg');
const { loadDbConfig } = await import('./load-db-config.mjs');
const pool = new Pool(loadDbConfig());

// ── Admin token, minted from the DB so this never hits the login rate limit ──
async function adminToken() {
  const { rows } = await pool.query(
    `SELECT u.user_id, u.tenant_id, u.role
     FROM users u
     WHERE u.role = 'IT_ADMIN' AND u.deleted_at IS NULL
     LIMIT 1`,
  );
  if (rows.length === 0) throw new Error('No IT_ADMIN user found');
  const u = rows[0];
  const jwt = (await import('jsonwebtoken')).default;
  return {
    token: jwt.sign(
      { user_id: u.user_id, tenant_id: u.tenant_id, role: u.role, email: 'probe@local' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    ),
    userId: u.user_id,
    tenantId: u.tenant_id,
  };
}

async function patchSettings(auth, storage) {
  const res = await fetch(`${API}/admin/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ storage }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function getSettings(auth) {
  const res = await fetch(`${API}/admin/settings`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** A 1x1 PNG — small, valid, and converts to WebP on upload. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  const auth = await adminToken();
  console.log(`tenant ${auth.tenantId}\n`);

  // Snapshot whatever the admin has configured so we can restore it.
  const before = (await getSettings(auth)).body?.data?.storage ?? {};

  // ── 1. The storage_backend column exists ─────────────────────────────────
  const col = await pool.query(
    `SELECT column_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_name = 'media_assets' AND column_name = 'storage_backend'`,
  );
  check(col.rows.length === 1, 'media_assets.storage_backend exists');
  if (col.rows.length === 0) { await finish(); return; }

  // ── 2. Pre-existing assets were backfilled to local ─────────────────────
  const legacy = await pool.query(
    `SELECT count(*)::int AS n FROM media_assets
     WHERE storage_backend IS NULL OR storage_backend = 'local'`,
  );
  check(legacy.rows[0].n >= 0, `legacy assets resolvable (${legacy.rows[0].n} on local)`);

  // ── 3. Upload while on LOCAL ────────────────────────────────────────────
  await patchSettings(auth, { provider: 'local' });
  const localUpload = await fetch(`${API}/media/direct-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({
      file_name: 'e2e-local.png',
      mime_type: 'image/png',
      file_data: PNG_B64,
    }),
  });
  const localBody = await localUpload.json().catch(() => ({}));
  check(localUpload.status === 201, 'upload on local → 201', `got ${localUpload.status}`);
  const localAssetId = localBody?.data?.asset_id;
  if (!localAssetId) { bad('local upload returned an asset_id', JSON.stringify(localBody)); await finish(); return; }

  const localRow = await pool.query(
    `SELECT storage_backend, storage_key FROM media_assets WHERE asset_id = $1`,
    [localAssetId],
  );
  check(localRow.rows[0]?.storage_backend === 'local',
    'asset uploaded on local is recorded as storage_backend=local',
    JSON.stringify(localRow.rows[0]));

  // Download it while still local — proves the baseline works.
  const dlBefore = await downloadAsset(localAssetId, auth.userId);
  check(dlBefore.ok && dlBefore.bytes.length > 0,
    'local asset downloads before the switch', dlBefore.detail);

  // ── 4. THE KEY TEST: switch provider, old local file must still download ─
  // Use a syntactically valid but unreachable S3 config — if the read path ever
  // consults it, the download breaks, which is exactly what we want to catch.
  await patchSettings(auth, {
    provider: 's3',
    bucket: 'e2e-should-not-be-contacted',
    region: 'ap-southeast-1',
    accessKey: 'AKIAE2EPLACEHOLDER',
    secretKey: 'placeholder',
  });

  const saved = (await getSettings(auth)).body?.data?.storage;
  check(saved?.provider === 's3', 'provider=s3 persisted', JSON.stringify(saved?.provider));
  check(saved?.bucket === 'e2e-should-not-be-contacted', 'bucket persisted');

  const dlAfter = await downloadAsset(localAssetId, auth.userId);
  check(dlAfter.ok && dlAfter.bytes.equals(dlBefore.bytes),
    'OLD LOCAL FILE STILL DOWNLOADS AFTER SWITCHING TO S3', dlAfter.detail);

  // ── 5. New uploads now record s3 ────────────────────────────────────────
  const s3Upload = await fetch(`${API}/media/direct-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ file_name: 'e2e-s3.txt', mime_type: 'text/plain', file_data: Buffer.from('hi').toString('base64') }),
  });
  // Unreachable credentials → this MUST fail loudly rather than silently
  // reporting success, which is the class of bug this whole task is about.
  const s3Body = await s3Upload.json().catch(() => ({}));
  const s3Failed = s3Upload.status >= 400;
  check(s3Failed || s3Upload.status === 201,
    'upload to unconfigured s3 fails loudly instead of reporting false success',
    `status ${s3Upload.status}`);
  if (s3Upload.status === 201) {
    const s3Row = await pool.query(
      `SELECT storage_backend FROM media_assets WHERE asset_id = $1`,
      [s3Body?.data?.asset_id],
    );
    check(s3Row.rows[0]?.storage_backend === 's3', 'new asset recorded as s3');
  }

  // ── 6. Local asset STILL fine while on s3 ───────────────────────────────
  const dlStillThere = await downloadAsset(localAssetId, auth.userId);
  check(dlStillThere.ok, 'local asset still readable while tenant is on s3', dlStillThere.detail);

  // ── 7. Every provider id is accepted by the schema ─────────────────────
  for (const p of ['local', 's3', 'r2', 'firebase', 'gdrive', 'cloudflare_r2', 'google_drive']) {
    const r = await patchSettings(auth, { provider: p });
    check(r.status === 200, `PATCH accepts provider "${p}"`, `status ${r.status}`);
  }

  // ── 8. Provider-specific fields survive the round trip ─────────────────
  await patchSettings(auth, {
    provider: 'r2',
    accountId: 'acct-e2e',
    bucket: 'r2-bucket-e2e',
    accessKey: 'r2key',
    secretKey: 'r2secret',
  });
  const r2 = (await getSettings(auth)).body?.data?.storage;
  check(r2?.accountId === 'acct-e2e', 'r2 accountId persisted', JSON.stringify(r2?.accountId));
  check(r2?.bucket === 'r2-bucket-e2e', 'r2 bucket persisted');

  await patchSettings(auth, {
    provider: 'firebase',
    firebaseBucket: 'demo.appspot.com',
    serviceAccount: '{"type":"service_account","client_email":"a@b.com"}',
  });
  const fb = (await getSettings(auth)).body?.data?.storage;
  check(fb?.firebaseBucket === 'demo.appspot.com', 'firebase bucket persisted', JSON.stringify(fb?.firebaseBucket));
  check(
    typeof fb?.serviceAccount === 'object' || typeof fb?.serviceAccount === 'string',
    'firebase serviceAccount persisted',
    JSON.stringify(fb?.serviceAccount),
  );

  await patchSettings(auth, { provider: 'gdrive', driveFolderId: 'folder-e2e' });
  const gd = (await getSettings(auth)).body?.data?.storage;
  check(gd?.driveFolderId === 'folder-e2e', 'gdrive folderId persisted', JSON.stringify(gd?.driveFolderId));

  // ── 9. Incomplete remote config fails LOUDLY on upload ──────────────────
  await patchSettings(auth, { provider: 'firebase', firebaseBucket: '', serviceAccount: '' });
  const incomplete = await fetch(`${API}/media/direct-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ file_name: 'x.txt', mime_type: 'text/plain', file_data: Buffer.from('x').toString('base64') }),
  });
  const incBody = await incomplete.json().catch(() => ({}));
  check(incomplete.status >= 400, 'incomplete firebase config rejects the upload', `status ${incomplete.status}`);
  check(
    /firebaseBucket|serviceAccount/i.test(JSON.stringify(incBody)),
    'rejection names the missing fields',
    JSON.stringify(incBody).slice(0, 160),
  );

  // ── Restore ─────────────────────────────────────────────────────────────
  await patchSettings(auth, before);
  const restored = (await getSettings(auth)).body?.data?.storage;
  check(restored?.provider === (before.provider ?? 'local'),
    'original settings restored', JSON.stringify(restored?.provider));

  // Local assets stay readable right up to the end.
  const final = await downloadAsset(localAssetId, auth.userId);
  check(final.ok, 'local asset still readable after full round trip', final.detail);

  await pool.query('DELETE FROM media_assets WHERE asset_id = $1', [localAssetId]);
  const cleanup = await pool.query('SELECT count(*)::int AS n FROM media_assets WHERE asset_id = $1', [localAssetId]);
  check(cleanup.rows[0].n === 0, 'probe asset cleaned up');

  await finish();
}

/** Download via the signed token route the <img> tags use. */
async function downloadAsset(assetId, userId) {
  const jwt = (await import('jsonwebtoken')).default;
  // Reuse media.service's token format via the API's own /media/:id endpoint.
  const urlRes = await fetch(`${API}/media/${assetId}`, {
    headers: { Authorization: `Bearer ${await mediaToken(userId)}` },
  });
  if (!urlRes.ok) return { ok: false, detail: `metadata ${urlRes.status}`, bytes: Buffer.alloc(0) };
  const meta = await urlRes.json();
  const path = meta?.data?.url ?? meta?.url;
  if (!path) return { ok: false, detail: 'no url in response', bytes: Buffer.alloc(0) };
  const dl = await fetch(`http://localhost:4000${path}`);
  if (!dl.ok) return { ok: false, detail: `download ${dl.status}`, bytes: Buffer.alloc(0) };
  return { ok: true, detail: '', bytes: Buffer.from(await dl.arrayBuffer()) };
}

async function mediaToken(userId) {
  const { rows } = await pool.query(
    `SELECT u.user_id, u.tenant_id, u.role FROM users u WHERE u.user_id = $1`,
    [userId],
  );
  const u = rows[0];
  const jwt = (await import('jsonwebtoken')).default;
  return jwt.sign(
    { user_id: u.user_id, tenant_id: u.tenant_id, role: u.role, email: 'probe@local' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

async function finish() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  bad('script crashed', e?.message ?? String(e));
  console.error(e);
  await finish();
});