#!/usr/bin/env node
/**
 * Proves the counselor photo actually renders on the public booking page.
 *
 * No counselor in the seed data has a profile photo yet, so "it renders
 * initials" proves nothing about the image path. This script borrows a REAL
 * photo from the only account that has one, points a counselor row at it, then:
 *   1. asserts GET /counseling/booking/config now carries thumb_url
 *   2. fetches that signed URL through the FRONTEND PROXY with no auth header
 *      and asserts a real WebP comes back (not a 401/404/JSON error)
 *   3. asserts a forged token is still rejected (regression guard)
 *
 * The DB mutation is done by the caller (psql lives in the postgres container,
 * not here). Restore the original avatar_key when done.
 *
 *   sudo docker exec \
 *     -e TENANT_ID=... -e TENANT_SLUG=hbics -e COUNSELOR_ID=... \
 *     swims_backend node /app/scripts/verify-counselor-avatar.mjs
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://frontend:3000';
const TENANT = process.env.TENANT_ID;
const SLUG = process.env.TENANT_SLUG;
const CID = process.env.COUNSELOR_ID;
const DONOR_KEY = process.env.DONOR_KEY;

/** MEDIA_DIR in avatar.service.ts — the storage key already starts with `avatars/`. */
const MEDIA_DIR = '/app/media';
const TEST_KEY = `avatars/${TENANT}/e2e-counselor-probe`;

for (const [k, v] of Object.entries({ TENANT_ID: TENANT, TENANT_SLUG: SLUG, COUNSELOR_ID: CID, DONOR_KEY: DONOR_KEY })) {
  if (!v) throw new Error(`missing env ${k}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok - ${msg}`);
}

// ── 1. borrow a real photo under a throwaway key ─────────────────────────────
console.log(`donor photo: ${DONOR_KEY}`);
const cleanup = async () => {
  for (const suffix of ['', '_thumb']) {
    await unlink(join(MEDIA_DIR, `${TEST_KEY}${suffix}.webp`)).catch(() => {});
  }
};

try {
  for (const suffix of ['', '_thumb']) {
    const bytes = await readFile(join(MEDIA_DIR, `${DONOR_KEY}${suffix}.webp`));
    await writeFile(join(MEDIA_DIR, `${TEST_KEY}${suffix}.webp`), bytes);
  }
  console.log('borrowed photo copied into place (caller now points the row at it)\n');

  // ── 2. the config endpoint must advertise it ───────────────────────────────
  const cfgRes = await fetch(`${BASE}/api/counseling/booking/config?t=${SLUG}`);
  assert(cfgRes.status === 200, `config 200 (got ${cfgRes.status})`);
  const cfg = (await cfgRes.json()).data;
  const c = cfg.find((x) => x.user_id === CID);
  assert(!!c, 'probed counselor present in config');
  assert(
    typeof c.thumb_url === 'string' && c.thumb_url.includes('/api/avatars/'),
    `thumb_url advertised: ${String(c.thumb_url).slice(0, 58)}...`,
  );
  assert(c.thumb_url.includes('variant=thumb'), 'signed for the thumb rendition');

  // no photo -> null, so the page renders initials instead of a broken image
  const others = cfg.filter((x) => x.user_id !== CID);
  assert(
    others.every((x) => x.thumb_url === null),
    'counselors without a photo advertise thumb_url: null (initials fallback)',
  );

  // ── 3. the image really loads through the proxy, unauthenticated ────────────
  const imgRes = await fetch(`${BASE}${c.thumb_url}`);
  assert(imgRes.status === 200, `image 200 through frontend proxy (got ${imgRes.status})`);
  const type = imgRes.headers.get('content-type') || '';
  assert(type.includes('image/webp'), `content-type is image/webp (got ${type})`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  assert(buf.length > 500, `body is a real image (${buf.length} bytes)`);
  assert(buf.subarray(0, 4).toString('ascii') === 'RIFF', 'WebP RIFF magic bytes');

  // ── 4. tenant pinning still holds ──────────────────────────────────────────
  const forged = c.thumb_url.replace(/token=[^&]+/, 'token=forged.token.value');
  const bad = await fetch(`${BASE}${forged}`);
  assert(bad.status === 401, `forged token rejected with 401 (got ${bad.status})`);

  console.log('\n✅ counselor photo verified end-to-end');
} finally {
  // Always remove the borrowed files, even on a failed assertion.
  await cleanup();
  console.log('   borrowed files deleted (restore the original avatar_key on the row)');
}