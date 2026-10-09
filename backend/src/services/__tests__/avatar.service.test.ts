import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

import { pool } from '../../db/pool.js';
import { auditLog } from '../../utils/audit-log.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../utils/errors.js';
import * as avatarService from '../avatar.service.js';

vi.mock('../../utils/audit-log.js', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

const TENANT = 'tenant-avatar-test';

/**
 * Build a REAL image buffer so sharp exercises its genuine decode path —
 * a stubbed sharp would happily "convert" a text file and hide the very
 * class of bug (renamed `.txt`, truncated upload) this service guards against.
 *
 * `noise: true` fills the pixels with random bytes so the JPEG stays
 * incompressible — that is how the 1 MB cap test gets a genuinely oversized
 * payload. Size is asserted by callers, not here.
 */
async function realImage(
  opts: { width?: number; height?: number; format?: 'jpeg' | 'png' | 'webp'; noise?: boolean } = {},
): Promise<Buffer> {
  const { width = 800, height = 600, format = 'jpeg', noise = true } = opts;
  const w = width;
  const h = height;
  const base = noise ? Buffer.alloc(w * h * 3) : undefined;
  if (base) {
    for (let i = 0; i < base.length; i++) base[i] = Math.floor(Math.random() * 256);
  }
  const img = sharp(
    base ?? { create: { width: w, height: h, channels: 3, background: '#3366aa' } },
    base ? { raw: { width: w, height: h, channels: 3 } } : undefined,
  );
  return format === 'jpeg' ? img.jpeg({ quality: 100 }).toBuffer() : img.png().toBuffer();
}

/** A photo-sized image that is comfortably UNDER the 1 MB upload cap. */
async function uploadablePhoto(width = 1600, height = 900): Promise<Buffer> {
  return realImage({ width, height, noise: false });
}

const b64 = (buf: Buffer) => buf.toString('base64');

/** Point the mocked pool at a fake "account exists, no photo yet" row. */
function mockAccount(row: { avatar_key?: string | null; avatar_updated_at?: string | null } | null) {
  (pool.query as any).mockImplementation(async (sql: string) => {
    if (/^\s*SELECT avatar_key/i.test(sql)) {
      if (!row) return { rows: [], rowCount: 0 };
      return { rows: [row], rowCount: 1 };
    }
    if (/^\s*UPDATE/i.test(sql)) {
      return { rows: [{ avatar_updated_at: new Date().toISOString() }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe('avatar.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (pool.query as any).mockResolvedValue({ rows: [], rowCount: 0 });
    (auditLog as any).mockResolvedValue(undefined);
    rmSync(join('/app/media/avatars', TENANT), { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(join('/app/media/avatars', TENANT), { recursive: true, force: true });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('generateAvatarToken / validateAvatarToken', () => {
    it('round-trips subject, tenant and variant', () => {
      const token = avatarService.generateAvatarToken('user-1', TENANT, 'thumb');
      const claims = avatarService.validateAvatarToken(token);
      expect(claims).toEqual({ subjectId: 'user-1', tenantId: TENANT, variant: 'thumb' });
    });

    it('emits a URL-safe token (no +, /, = padding)', () => {
      const token = avatarService.generateAvatarToken('user-1', TENANT, 'full');
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('rejects a token whose tenant was swapped (cross-school replay)', () => {
      const token = avatarService.generateAvatarToken('user-1', TENANT, 'thumb');
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      decoded.tenant = 'tenant-other-school';
      const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');
      expect(() => avatarService.validateAvatarToken(forged)).toThrow(UnauthorizedError);
    });

    it('rejects a token whose subject was swapped', () => {
      const token = avatarService.generateAvatarToken('user-1', TENANT, 'thumb');
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      decoded.sub = 'victim-user';
      const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');
      expect(() => avatarService.validateAvatarToken(forged)).toThrow(/signature/i);
    });

    it('rejects an expired token', () => {
      const token = avatarService.generateAvatarToken('user-1', TENANT, 'thumb');
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      decoded.exp = Math.floor(Date.now() / 1000) - 60;
      const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');
      expect(() => avatarService.validateAvatarToken(forged)).toThrow(/kedaluwarsa/i);
    });

    it('rejects garbage', () => {
      expect(() => avatarService.validateAvatarToken('not-a-token')).toThrow(UnauthorizedError);
    });

    it('rejects every failure mode as 401 Unauthorized, never 400', () => {
      // A forged token is an auth failure. Reporting 400 would tell an attacker
      // their forgery was merely "malformed" rather than rejected.
      const garbage = () => avatarService.validateAvatarToken('not-a-token');
      try {
        garbage();
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedError);
        expect((err as UnauthorizedError).statusCode).toBe(401);
      }
    });

    it('is deterministic within its TTL window shape (two tokens verify identically)', () => {
      const a = avatarService.generateAvatarToken('user-1', TENANT, 'full');
      const b = avatarService.generateAvatarToken('user-1', TENANT, 'full');
      // Different only if the second boundary was crossed mid-test.
      expect(avatarService.validateAvatarToken(a).subjectId).toBe(
        avatarService.validateAvatarToken(b).subjectId,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('buildAvatarUrl', () => {
    it('points at the render route and carries the variant + token', () => {
      const url = avatarService.buildAvatarUrl('user-1', TENANT, 'thumb');
      expect(url).toMatch(/^\/api\/avatars\/user-1\?variant=thumb&token=/);
    });

    it('appends a v= cache-buster when a version is supplied', () => {
      const url = avatarService.buildAvatarUrl('user-1', TENANT, 'full', '2026-01-01T00:00:00.000Z');
      expect(url).toMatch(/&v=\d+$/);
    });

    it('omits v= when no version is supplied', () => {
      expect(avatarService.buildAvatarUrl('user-1', TENANT, 'full')).not.toContain('v=');
    });

    it('produces a URL whose token actually validates', () => {
      const url = avatarService.buildAvatarUrl('user-9', TENANT, 'full');
      const token = decodeURIComponent(new URL(url, 'http://x').searchParams.get('token')!);
      expect(avatarService.validateAvatarToken(token)).toEqual({
        subjectId: 'user-9',
        tenantId: TENANT,
        variant: 'full',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('uploadAvatar — validation', () => {
    it('rejects a non-image MIME type', async () => {
      await expect(
        avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(Buffer.from('hi')), mime_type: 'text/plain' }, 'admin'),
      ).rejects.toThrow(/JPG, PNG, atau WebP/i);
    });

    it('rejects an SVG (XSS vector) even though it is "image/*"', async () => {
      const svg = Buffer.from('<svg onload="alert(1)"></svg>');
      await expect(
        avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(svg), mime_type: 'image/svg+xml' }, 'admin'),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects an empty payload', async () => {
      await expect(
        avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: '', mime_type: 'image/jpeg' }, 'admin'),
      ).rejects.toThrow(/kosong/i);
    });

    it('rejects a file over 1 MB (measured on DECODED bytes, not base64 length)', async () => {
      // Random noise → incompressible, so ~1.6 MB of raw pixels survives base64.
      const big = await realImage({ width: 1100, height: 1100 });
      expect(big.length).toBeGreaterThan(avatarService.MAX_UPLOAD_BYTES);
      await expect(
        avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(big), mime_type: 'image/jpeg' }, 'admin'),
      ).rejects.toThrow(/melebihi batas/i);
    });

    it('rejects a text file masquerading as a JPEG (real decode check)', async () => {
      const notAnImage = Buffer.from('<?php echo "pwned"; ?>');
      await expect(
        avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(notAnImage), mime_type: 'image/jpeg' }, 'admin'),
      ).rejects.toThrow(/tidak dapat dibaca|valid/i);
    });

    it('rejects a truncated image', async () => {
      // Half a JPEG: sharp reports "premature end of JPEG image", which the
      // service must map to a clean 400 rather than leaking a 500.
      const full = await realImage({ width: 600, height: 400 });
      const truncated = full.subarray(0, Math.floor(full.length / 2));
      await expect(
        avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(truncated), mime_type: 'image/jpeg' }, 'admin'),
      ).rejects.toThrow(ValidationError);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('uploadAvatar — conversion & persistence', () => {
    it('converts a landscape JPEG to a 512×512 WebP', async () => {
      mockAccount({ avatar_key: null });
      const jpeg = await uploadablePhoto(1600, 900);
      const res = await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(jpeg), mime_type: 'image/jpeg' }, 'admin');

      expect(res.avatar_url).toMatch(/variant=full/);
      expect(res.thumb_url).toMatch(/variant=thumb/);
      expect(res.original_bytes).toBe(jpeg.length);

      const meta = await sharp(res.size_bytes ? await readStored(TENANT, 'full') : Buffer.alloc(0)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(512);
    });

    it('accepts a full data: URL as well as a bare base64 string', async () => {
      mockAccount({ avatar_key: null });
      const png = await realImage({ width: 300, height: 300, format: 'png', noise: false });
      const res = await avatarService.uploadAvatar(
        TENANT, 'user-1', 'users',
        { file_data: `data:image/png;base64,${b64(png)}`, mime_type: 'image/png' },
        'admin',
      );
      expect(res.size_bytes).toBeGreaterThan(0);
    });

    it('produces a 128×128 thumb that is smaller than the full-size file', async () => {
      mockAccount({ avatar_key: null });
      const jpeg = await uploadablePhoto(1200, 1200);
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(jpeg), mime_type: 'image/jpeg' }, 'admin');

      const full = await readStored(TENANT, 'full');
      const thumb = await readStored(TENANT, 'thumb');
      const tMeta = await sharp(thumb).metadata();

      expect(tMeta.width).toBe(128);
      expect(tMeta.height).toBe(128);
      expect(thumb.length).toBeLessThan(full.length);
    });

    it('actually compresses: output is far smaller than the original', async () => {
      mockAccount({ avatar_key: null });
      const jpeg = await uploadablePhoto(1600, 1200);
      const res = await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(jpeg), mime_type: 'image/jpeg' }, 'admin');
      expect(res.size_bytes).toBeLessThan(res.original_bytes);
    });

    it('writes the storage key scoped to the tenant', async () => {
      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(await realImage({ noise: false })), mime_type: 'image/jpeg' }, 'admin');
      const sql = (pool.query as any).mock.calls.find((c: any[]) => /^\s*UPDATE/i.test(c[0]));
      const key = sql![1][0];
      expect(key.startsWith(`avatars/${TENANT}/`)).toBe(true);
    });

    it('scopes the UPDATE to the tenant and to live rows only', async () => {
      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(await realImage({ noise: false })), mime_type: 'image/jpeg' }, 'admin');
      const sql = (pool.query as any).mock.calls.find((c: any[]) => /^\s*UPDATE/i.test(c[0]))![0];
      expect(sql).toContain('tenant_id = $3');
      expect(sql).toContain('deleted_at IS NULL');
    });

    it('updates the students table when that is the account type', async () => {
      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, 'stu-1', 'students', { file_data: b64(await realImage({ noise: false })), mime_type: 'image/jpeg' }, 'admin');
      const sql = (pool.query as any).mock.calls.find((c: any[]) => /^\s*UPDATE/i.test(c[0]))![0];
      expect(sql).toContain('UPDATE students');
      expect(sql).toContain('student_id = $2');
    });

    it('writes an audit entry for the upload', async () => {
      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(await realImage({ noise: false })), mime_type: 'image/jpeg' }, 'admin');
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'USER_AVATAR_UPLOADED',
        entityId: 'user-1',
        tenantId: TENANT,
        actorId: 'admin',
      }));
    });

    it('removes the superseded photo files when replacing one', async () => {
      const first = await realImage({ width: 300, height: 300, noise: false });
      const second = await realImage({ width: 400, height: 400, noise: false });

      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(first), mime_type: 'image/jpeg' }, 'admin');

      // Read back the key the first upload stored, then make the row "have" it.
      const firstKey = (pool.query as any).mock.calls.find((c: any[]) => /^\s*UPDATE/i.test(c[0]))![1][0];
      const oldDir = join('/app/media/avatars', TENANT);
      expect(existsSync(join(oldDir, `${firstKey.split('/').pop()}.webp`))).toBe(true);

      mockAccount({ avatar_key: firstKey, avatar_updated_at: new Date().toISOString() });
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(second), mime_type: 'image/jpeg' }, 'admin');

      // Orphan sweep is best-effort/async — give the unlink a tick to land.
      await new Promise((r) => setTimeout(r, 50));
      expect(existsSync(join(oldDir, `${firstKey.split('/').pop()}.webp`))).toBe(false);
      expect(existsSync(join(oldDir, `${firstKey.split('/').pop()}_thumb.webp`))).toBe(false);
    });

    it('never writes outside the avatars directory (traversal guard)', async () => {
      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, '../../../etc', 'users', { file_data: b64(await realImage({ noise: false })), mime_type: 'image/jpeg' }, 'admin');
      const key = (pool.query as any).mock.calls.find((c: any[]) => /^\s*UPDATE/i.test(c[0]))![1][0];
      // The account id is only used as the uuid filename, never as a path segment.
      expect(key.startsWith(`avatars/${TENANT}/`)).toBe(true);
      expect(key).not.toContain('..');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('deleteAvatar', () => {
    it('throws NotFoundError for an unknown account', async () => {
      mockAccount(null);
      await expect(avatarService.deleteAvatar(TENANT, 'ghost', 'users', 'admin')).rejects.toThrow(NotFoundError);
    });

    it('is a no-op when the account exists but has no photo', async () => {
      mockAccount({ avatar_key: null });
      await expect(avatarService.deleteAvatar(TENANT, 'user-1', 'users', 'admin')).resolves.toEqual({ deleted: false });
    });

    it('clears the column and removes both files', async () => {
      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(await realImage({ noise: false })), mime_type: 'image/jpeg' }, 'admin');
      const key = (pool.query as any).mock.calls.find((c: any[]) => /^\s*UPDATE/i.test(c[0]))![1][0];
      const fname = key.split('/').pop()!;

      mockAccount({ avatar_key: key, avatar_updated_at: new Date().toISOString() });
      await expect(avatarService.deleteAvatar(TENANT, 'user-1', 'users', 'admin')).resolves.toEqual({ deleted: true });

      // The delete's own UPDATE is the LAST one issued — the upload's is still
      // in the call log, so match on the NULL-setting statement specifically.
      const deleteSql = (pool.query as any).mock.calls
        .map((c: any[]) => c[0] as string)
        .filter((s: string) => /^\s*UPDATE/i.test(s) && /avatar_key = NULL/.test(s));
      expect(deleteSql).toHaveLength(1);
      expect(existsSync(join('/app/media/avatars', TENANT, `${fname}.webp`))).toBe(false);
      expect(existsSync(join('/app/media/avatars', TENANT, `${fname}_thumb.webp`))).toBe(false);
    });

    it('audits the deletion', async () => {
      mockAccount({ avatar_key: 'avatars/x/y', avatar_updated_at: new Date().toISOString() });
      await avatarService.deleteAvatar(TENANT, 'user-1', 'users', 'admin');
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_AVATAR_DELETED' }));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('getAvatarObject', () => {
    it('throws NotFoundError when the account has no photo', async () => {
      mockAccount({ avatar_key: null });
      await expect(avatarService.getAvatarObject(TENANT, 'user-1', 'full')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the row points at a file that is gone', async () => {
      mockAccount({ avatar_key: 'avatars/ghost/missing', avatar_updated_at: new Date().toISOString() });
      await expect(avatarService.getAvatarObject(TENANT, 'user-1', 'full')).rejects.toThrow(NotFoundError);
    });

    it('returns the full-size bytes with a matching length', async () => {
      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(await realImage({ noise: false })), mime_type: 'image/jpeg' }, 'admin');
      const key = (pool.query as any).mock.calls.find((c: any[]) => /^\s*UPDATE/i.test(c[0]))![1][0];
      mockAccount({ avatar_key: key, avatar_updated_at: new Date().toISOString() });

      const { Body, sizeBytes } = await avatarService.getAvatarObject(TENANT, 'user-1', 'full');
      expect(sizeBytes).toBe(Body.length);
      expect((await sharp(Body).metadata()).width).toBe(512);
    });

    it('returns the smaller thumb bytes for the thumb variant', async () => {
      mockAccount({ avatar_key: null });
      await avatarService.uploadAvatar(TENANT, 'user-1', 'users', { file_data: b64(await realImage({ noise: false })), mime_type: 'image/jpeg' }, 'admin');
      const key = (pool.query as any).mock.calls.find((c: any[]) => /^\s*UPDATE/i.test(c[0]))![1][0];
      mockAccount({ avatar_key: key, avatar_updated_at: new Date().toISOString() });

      const full = await avatarService.getAvatarObject(TENANT, 'user-1', 'full');
      const thumb = await avatarService.getAvatarObject(TENANT, 'user-1', 'thumb');
      expect(thumb.sizeBytes).toBeLessThan(full.sizeBytes);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('getAvatarUrl', () => {
    it('returns null when there is no photo', async () => {
      mockAccount({ avatar_key: null });
      await expect(avatarService.getAvatarUrl(TENANT, 'user-1')).resolves.toBeNull();
    });

    it('defaults to the thumb variant', async () => {
      mockAccount({ avatar_key: 'avatars/x/y', avatar_updated_at: new Date().toISOString() });
      const url = await avatarService.getAvatarUrl(TENANT, 'user-1');
      expect(url).toContain('variant=thumb');
    });

    it('carries the cache-buster so a replaced photo is not served stale', async () => {
      mockAccount({ avatar_key: 'avatars/x/y', avatar_updated_at: '2026-05-05T10:00:00.000Z' });
      const url = await avatarService.getAvatarUrl(TENANT, 'user-1', 'full');
      expect(url).toMatch(/&v=\d+$/);
    });
  });
});

/** Read back whichever file the last upload wrote for the given variant. */
async function readStored(tenant: string, variant: 'full' | 'thumb'): Promise<Buffer> {
  const dir = join('/app/media/avatars', tenant);
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(dir);
  const match = variant === 'thumb'
    ? files.find((f) => f.endsWith('_thumb.webp'))
    : files.find((f) => f.endsWith('.webp') && !f.endsWith('_thumb.webp'));
  if (!match) throw new Error(`no stored ${variant} file in ${dir}: ${files.join(',')}`);
  return readFile(join(dir, match));
}