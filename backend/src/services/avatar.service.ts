import { createHmac, randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { auditLog } from '../utils/audit-log.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import type { Request } from 'express';

/**
 * Profile photos ("avatar") for every account.
 *
 * Design notes
 * ─────────────
 * • Bytes live on disk under the `media_data` volume (`/app/media/avatars/<tenant>/`),
 *   NOT in the row. A 512 px WebP is ~25–60 KB, so the row stays tiny and every
 *   list query keeps returning fast.
 * • Every upload produces TWO files: `…webp` (512 px, the dialog / full view) and
 *   `…_thumb.webp` (128 px, tables and lists). A roster of 50 users then pulls
 *   ~5 KB each instead of ~40 KB.
 * • Input is capped at 1 MB (see `MAX_UPLOAD_BYTES`) and must be a real raster
 *   image. The cap is enforced on the DECODED byte length, not on the base64
 *   string, so a caller cannot smuggle a 4 MB image past it by base64 tricks.
 * • sharp does auto-rotate (EXIF) + centre-crop to a square, so a landscape
 *   phone photo and a portrait one both come out as a tidy circular-ready crop.
 *
 * `<img src>` cannot send an `Authorization` header, so the bytes are served
 * from `GET /api/avatars/:id` which accepts an HMAC-signed `?token=` (same
 * scheme as the media download route) or a plain JWT.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MEDIA_DIR = '/app/media';
const AVATAR_SUBDIR = 'avatars';

/** Hard cap on the uploaded (pre-conversion) file. */
export const MAX_UPLOAD_BYTES = 1024 * 1024; // 1 MB

/** Full-size (square, WebP). */
const FULL_SIZE = 512;
const FULL_QUALITY = 82;
/** List/table thumbnail (square, WebP). */
const THUMB_SIZE = 128;
const THUMB_QUALITY = 78;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const AVATAR_TOKEN_TTL = 60 * 60; // 1 hour — same as the media download token

// ─── Sharp (lazy) ─────────────────────────────────────────────────────────────
// Lazy-load so a missing native binary can never take the whole API down at
// boot; only avatar uploads would fail, and they fail with a clear message.
let sharpModule: any = null;
async function getSharp(): Promise<any> {
  if (!sharpModule) {
    try {
      sharpModule = (await import('sharp')).default;
    } catch (err) {
      console.error('[avatar] sharp could not be loaded:', err);
      throw new ValidationError('Server tidak dapat memproses gambar (sharp tidak tersedia).');
    }
  }
  return sharpModule;
}

// ─── Paths ────────────────────────────────────────────────────────────────────

/** `${MEDIA_DIR}/<key>` with a traversal guard — `key` always comes from our own
 *  writes or from the DB, but a poisoned row should still not escape the dir. */
function resolvePath(storageKey: string): string {
  const full = join(MEDIA_DIR, storageKey);
  const root = join(MEDIA_DIR, AVATAR_SUBDIR);
  if (!full.startsWith(root)) {
    throw new ValidationError('Invalid avatar storage key.');
  }
  return full;
}

async function ensureDir(tenantId: string): Promise<string> {
  const dir = join(MEDIA_DIR, AVATAR_SUBDIR, tenantId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

// ─── Signed token for <img> rendering ─────────────────────────────────────────

/**
 * Token format: base64url(JSON{ sub, exp, hmac }) over `${subject}:${tenant}:${exp}`.
 * `sub` is the account the caller wants to VIEW (so the route can scope the DB
 * lookup to the right table) and the tenant is pinned into the signature, so a
 * token cannot be replayed against another school.
 */
export function generateAvatarToken(subjectId: string, tenantId: string, variant: AvatarVariant): string {
  const exp = Math.floor(Date.now() / 1000) + AVATAR_TOKEN_TTL;
  const payload = `${subjectId}:${tenantId}:${variant}:${exp}`;
  const hmac = createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
  return Buffer.from(JSON.stringify({ sub: subjectId, tenant: tenantId, variant, exp, hmac })).toString('base64url');
}

/**
 * Verify a token and return its claims.
 *
 * Throws `UnauthorizedError` (→ 401) on ANY failure — a malformed, expired or
 * tampered token is an authentication failure, not a bad request. The route
 * layer also relies on this: it lets `validateAvatarToken`'s error bubble up as
 * the response status, so throwing `ValidationError` here would tell an attacker
 * their forged token was merely "malformed" (400) instead of rejected (401).
 */
export function validateAvatarToken(token: string): { subjectId: string; tenantId: string; variant: AvatarVariant } {
  let parsed: { sub: string; tenant: string; variant: AvatarVariant; exp: number; hmac: string };
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString());
  } catch {
    throw new UnauthorizedError('Invalid avatar token');
  }
  const { sub, tenant, variant, exp, hmac } = parsed;
  if (typeof exp !== 'number' || exp * 1000 < Date.now()) {
    throw new UnauthorizedError('Avatar token kedaluwarsa');
  }
  const expected = createHmac('sha256', env.JWT_SECRET)
    .update(`${sub}:${tenant}:${variant}:${exp}`)
    .digest('base64url');
  if (expected !== hmac) {
    throw new UnauthorizedError('Invalid avatar token signature');
  }
  return { subjectId: sub, tenantId: tenant, variant };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvatarVariant = 'full' | 'thumb';
export type AvatarTable = 'users' | 'students';

export interface AvatarUploadInput {
  /** base64 payload, WITHOUT the `data:` prefix. */
  file_data: string;
  mime_type: string;
  file_name?: string;
}

export interface AvatarUploadResult {
  avatar_url: string;
  thumb_url: string;
  /** Bytes actually written for the full-size WebP — surfaced so the UI can
   *  prove the compression worked. */
  size_bytes: number;
  original_bytes: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert + persist an avatar for `accountId`, replacing any previous photo.
 * Returns ready-to-use URLs (signed, so they render directly in `<img src>`).
 */
export async function uploadAvatar(
  tenantId: string,
  accountId: string,
  table: AvatarTable,
  input: AvatarUploadInput,
  viewerId: string,
  req?: Request,
): Promise<AvatarUploadResult> {
  const mime = (input.mime_type || '').toLowerCase().split(';')[0]!.trim();
  if (!ALLOWED_MIME.has(mime)) {
    throw new ValidationError('Format foto harus JPG, PNG, atau WebP.');
  }

  // Accept both a bare base64 string and a full data URL.
  const base64 = input.file_data.includes(',') ? input.file_data.slice(input.file_data.indexOf(',') + 1) : input.file_data;
  if (!base64) {
    throw new ValidationError('Berkas foto kosong.');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new ValidationError('Berkas foto tidak valid.');
  }
  if (buffer.length === 0) {
    throw new ValidationError('Berkas foto kosong.');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError(
      `Ukuran foto melebihi batas ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024 * 10) / 10} MB.`,
    );
  }

  const s = await getSharp();
  let full: Buffer;
  let thumb: Buffer;
  try {
    // EXIF auto-rotate, then centre-crop to a square. `failOn: 'none'` keeps a
    // slightly-off PNG from being rejected outright.
    const base = () => s(buffer, { failOn: 'warning' }).rotate();
    full = await base()
      .resize(FULL_SIZE, FULL_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: FULL_QUALITY })
      .toBuffer();
    thumb = await base()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
  } catch (err: unknown) {
    // sharp throws for anything it cannot decode — a renamed .txt, a truncated
    // file, an exotic format. Surface it as a validation error, not a 500.
    // The list is deliberately broad: sharp's message wording varies by format
    // and version ("Input buffer contains unsupported image format",
    // "premature end of JPEG image", "VipsJpeg: …", "bad seek", …), and a missed
    // match here leaks a raw 500 to the user instead of a clean 400.
    const message = err instanceof Error ? err.message : String(err);
    const UNREADABLE = /unsupported image format|input buffer|bad seek|truncat|premature end|unidentified image|corrupt/i;
    if (UNREADABLE.test(message)) {
      throw new ValidationError('Foto tidak dapat dibaca. Pastikan berkas adalah gambar JPG/PNG yang valid.');
    }
    throw err;
  }

  const before = await readAvatarRow(tenantId, accountId, table);

  const dir = await ensureDir(tenantId);
  const id = uuidv4();
  const baseKey = `${AVATAR_SUBDIR}/${tenantId}/${id}`;
  await writeFile(join(dir, `${id}.webp`), full);
  await writeFile(join(dir, `${id}_thumb.webp`), thumb);

  // RETURNING the timestamp so the URLs we hand back carry a matching `v=`
  // cache-buster — otherwise the dialog would render the photo from cache
  // under the same URL the old avatar used to occupy.
  const { rows } = await pool.query<{ avatar_updated_at: string }>(
    `UPDATE ${table === 'users' ? 'users' : 'students'}
        SET avatar_key = $1, avatar_updated_at = now()
      WHERE ${table === 'users' ? 'user_id' : 'student_id'} = $2
        AND tenant_id = $3
        AND deleted_at IS NULL
      RETURNING avatar_updated_at`,
    [baseKey, accountId, tenantId],
  );

  // Best-effort cleanup of the superseded files — never fail the upload for it.
  if (before?.avatar_key) {
    void deleteAvatarFiles(before.avatar_key);
  }

  await auditLog({
    action: 'USER_AVATAR_UPLOADED',
    entityType: table,
    entityId: accountId,
    before: before ? { avatar_key: before.avatar_key } : null,
    after: { avatar_key: baseKey, size_bytes: full.length },
    req,
    tenantId,
    actorId: viewerId,
  });

  const version = rows[0]?.avatar_updated_at ?? new Date().toISOString();

  return {
    avatar_url: buildAvatarUrl(accountId, tenantId, 'full', version),
    thumb_url: buildAvatarUrl(accountId, tenantId, 'thumb', version),
    size_bytes: full.length,
    original_bytes: buffer.length,
  };
}

/** Clear the avatar for an account and delete its files. */
export async function deleteAvatar(
  tenantId: string,
  accountId: string,
  table: AvatarTable,
  viewerId: string,
  req?: Request,
): Promise<{ deleted: boolean }> {
  const before = await readAvatarRow(tenantId, accountId, table);
  if (!before) throw new NotFoundError(table === 'users' ? 'User' : 'Student', accountId);
  if (!before.avatar_key) return { deleted: false };

  await pool.query(
    `UPDATE ${table === 'users' ? 'users' : 'students'}
        SET avatar_key = NULL, avatar_updated_at = now()
      WHERE ${table === 'users' ? 'user_id' : 'student_id'} = $1
        AND tenant_id = $2 AND deleted_at IS NULL`,
    [accountId, tenantId],
  );

  await deleteAvatarFiles(before.avatar_key);

  await auditLog({
    action: 'USER_AVATAR_DELETED',
    entityType: table,
    entityId: accountId,
    before: { avatar_key: before.avatar_key },
    after: { avatar_key: null },
    req,
    tenantId,
    actorId: viewerId,
  });

  return { deleted: true };
}

/** Read the raw WebP bytes for rendering. Throws NotFoundError when there is none. */
export async function getAvatarObject(
  tenantId: string,
  accountId: string,
  variant: AvatarVariant,
): Promise<{ Body: Buffer; sizeBytes: number }> {
  const row = await readAvatarRow(tenantId, accountId, null);
  if (!row?.avatar_key) {
    throw new NotFoundError('Avatar', accountId);
  }
  const key = variant === 'thumb' ? `${row.avatar_key}_thumb.webp` : `${row.avatar_key}.webp`;
  const path = resolvePath(key);
  if (!existsSync(path)) {
    // Row points at a file that is gone (volume reset / manual cleanup).
    throw new NotFoundError('Avatar file', key);
  }
  const data = await readFile(path);
  return { Body: data, sizeBytes: data.length };
}

/** Signed URL for `<img src>`; `null` when the account has no photo. */
export async function getAvatarUrl(
  tenantId: string,
  accountId: string,
  variant: AvatarVariant = 'thumb',
): Promise<string | null> {
  const row = await readAvatarRow(tenantId, accountId, null);
  if (!row?.avatar_key) return null;
  return buildAvatarUrl(accountId, tenantId, variant, row.avatar_updated_at);
}

/**
 * Build the signed URL. `version` is appended as `v=` so a replaced photo is
 * not served from the browser cache under the same URL.
 */
export function buildAvatarUrl(
  accountId: string,
  tenantId: string,
  variant: AvatarVariant,
  version?: string | null,
): string {
  const token = generateAvatarToken(accountId, tenantId, variant);
  const v = version ? `&v=${encodeURIComponent(new Date(version).getTime().toString())}` : '';
  return `/api/avatars/${accountId}?variant=${variant}&token=${encodeURIComponent(token)}${v}`;
}

// ─── Internals ────────────────────────────────────────────────────────────────

interface AvatarRow {
  avatar_key: string | null;
  avatar_updated_at: string | null;
}

/**
 * Look up an account's avatar row. `table` narrows the search — pass null when
 * the id could be either a user or a student (rendering path); the `users` table
 * is checked first so a staff id always resolves to the staff photo.
 */
async function readAvatarRow(
  tenantId: string,
  accountId: string,
  table: AvatarTable | null,
): Promise<AvatarRow | null> {
  const tables: AvatarTable[] = table ? [table] : ['users', 'students'];
  for (const t of tables) {
    const idCol = t === 'users' ? 'user_id' : 'student_id';
    const { rows } = await pool.query<AvatarRow>(
      `SELECT avatar_key, avatar_updated_at
         FROM ${t}
        WHERE ${idCol} = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [accountId, tenantId],
    );
    if (rows.length > 0) return rows[0]!;
  }
  return null;
}

/**
 * Remove an avatar's two files from the media volume.
 *
 * Exported for the account-deletion path: it soft-deletes the row FIRST, so
 * `deleteAvatar` (which reads the row with `deleted_at IS NULL` and needs a
 * viewerId for audit) can no longer find it. The caller already has the
 * `avatar_key` from the UPDATE ... RETURNING, so pass that straight through.
 */
export async function deleteAvatarFiles(avatarKey: string): Promise<void> {
  for (const key of [`${avatarKey}.webp`, `${avatarKey}_thumb.webp`]) {
    try {
      await unlink(resolvePath(key));
    } catch {
      /* already gone */
    }
  }
}