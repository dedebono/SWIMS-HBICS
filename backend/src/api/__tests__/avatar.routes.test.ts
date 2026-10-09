import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool } from '../../db/pool.js';
import * as avatarService from '../../services/avatar.service.js';

const TENANT = 'tenant-123';

/**
 * Real UUIDs. The avatar routes reject a malformed id with a clean 404 before
 * it ever reaches Postgres (otherwise the driver raises "invalid input syntax
 * for type uuid" and the user gets a 500), so placeholder ids would be
 * short-circuited by the guard rather than exercising the handler.
 */
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';

const IT_ADMIN = generateTestToken(TENANT, 'admin-user', 'IT_ADMIN');
const TEACHER = generateTestToken(TENANT, 'teacher-user', 'TEACHER');
/** Signed in as the staff account itself — the self-service path. */
const STAFF_SELF = generateTestToken(TENANT, STAFF_ID, 'TEACHER');

/**
 * `resolveAccountTable` probes `users` then `students`; rowCount decides which.
 * Default: the id is a staff account.
 */
function mockAccountExists(table: 'users' | 'students' | 'none' = 'users') {
  (pool.query as any).mockImplementation(async (sql: string) => {
    if (/FROM\s+users/i.test(sql) && !/avatar_key/i.test(sql)) {
      return table === 'users' ? { rows: [{ '?column?': 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/FROM\s+students/i.test(sql) && !/avatar_key/i.test(sql)) {
      return table === 'students' ? { rows: [{ '?column?': 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe('Avatar Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountExists('users');
    vi.spyOn(avatarService, 'uploadAvatar').mockResolvedValue({
      avatar_url: `/api/avatars/${STAFF_ID}?variant=full&token=x`,
      thumb_url: `/api/avatars/${STAFF_ID}?variant=thumb&token=y`,
      size_bytes: 1234,
      original_bytes: 5678,
    });
    vi.spyOn(avatarService, 'deleteAvatar').mockResolvedValue({ deleted: true });
    vi.spyOn(avatarService, 'getAvatarObject').mockResolvedValue({
      Body: Buffer.from([0x52, 0x49, 0x46, 0x46]),
      sizeBytes: 4,
    });
  });

  // ── POST ────────────────────────────────────────────────────────────────────
  describe('POST /api/avatars/:id', () => {
    it('lets a user upload their OWN photo without any admin permission', async () => {
      const res = await request(app)
        .post(`/api/avatars/${STAFF_ID}`)
        .set('Authorization', `Bearer ${STAFF_SELF}`)
        .send({ file_data: 'AAAA', mime_type: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('avatar_url');
    });

    it('lets an IT_ADMIN upload somebody else\'s photo', async () => {
      const res = await request(app)
        .post(`/api/avatars/${STAFF_ID}`)
        .set('Authorization', `Bearer ${IT_ADMIN}`)
        .send({ file_data: 'AAAA', mime_type: 'image/jpeg' });
      expect(res.status).toBe(200);
    });

    it('refuses a TEACHER editing somebody else\'s photo (no admin:update)', async () => {
      const res = await request(app)
        .post(`/api/avatars/${STAFF_ID}`)
        .set('Authorization', `Bearer ${TEACHER}`)
        .send({ file_data: 'AAAA', mime_type: 'image/jpeg' });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects with 401 when no credentials are supplied', async () => {
      const res = await request(app)
        .post(`/api/avatars/${STAFF_ID}`)
        .send({ file_data: 'AAAA', mime_type: 'image/jpeg' });
      expect(res.status).toBe(401);
    });

    it('404s for an account that exists in neither table', async () => {
      mockAccountExists('none');
      const res = await request(app)
        .post(`/api/avatars/${STAFF_ID}`)
        .set('Authorization', `Bearer ${IT_ADMIN}`)
        .send({ file_data: 'AAAA', mime_type: 'image/jpeg' });
      expect(res.status).toBe(404);
    });

    it('404s for a malformed id instead of letting Postgres raise a 500', async () => {
      const res = await request(app)
        .post('/api/avatars/not-a-uuid')
        .set('Authorization', `Bearer ${IT_ADMIN}`)
        .send({ file_data: 'AAAA', mime_type: 'image/jpeg' });
      expect(res.status).toBe(404);
    });

    it('resolves a student id to the students table', async () => {
      mockAccountExists('students');
      const res = await request(app)
        .post(`/api/avatars/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${IT_ADMIN}`)
        .send({ file_data: 'AAAA', mime_type: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(avatarService.uploadAvatar).toHaveBeenCalledWith(
        TENANT, STUDENT_ID, 'students', expect.anything(), 'admin-user', expect.anything(),
      );
    });

    it('validates the body shape', async () => {
      const res = await request(app)
        .post(`/api/avatars/${STAFF_ID}`)
        .set('Authorization', `Bearer ${IT_ADMIN}`)
        .send({ mime_type: 'image/jpeg' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(avatarService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('surfaces a ValidationError from the service as a 400', async () => {
      const { ValidationError } = await import('../../utils/errors.js');
      vi.spyOn(avatarService, 'uploadAvatar').mockRejectedValue(new ValidationError('Ukuran foto melebihi batas 1 MB.'));
      const res = await request(app)
        .post(`/api/avatars/${STAFF_ID}`)
        .set('Authorization', `Bearer ${IT_ADMIN}`)
        .send({ file_data: 'AAAA', mime_type: 'image/jpeg' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────
  describe('DELETE /api/avatars/:id', () => {
    it('lets the owner clear their own photo', async () => {
      const res = await request(app)
        .delete(`/api/avatars/${STAFF_ID}`)
        .set('Authorization', `Bearer ${STAFF_SELF}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
    });

    it('refuses a TEACHER clearing somebody else\'s photo', async () => {
      const res = await request(app)
        .delete(`/api/avatars/${STAFF_ID}`)
        .set('Authorization', `Bearer ${TEACHER}`);
      expect(res.status).toBe(403);
      expect(avatarService.deleteAvatar).not.toHaveBeenCalled();
    });

    it('rejects with 401 without credentials', async () => {
      const res = await request(app).delete(`/api/avatars/${STAFF_ID}`);
      expect(res.status).toBe(401);
    });
  });

  // ── GET /:id/url — re-mint a fresh signed URL ──────────────────────────────
  describe('GET /api/avatars/:id/url', () => {
    beforeEach(() => {
      vi.spyOn(avatarService, 'getAvatarUrl').mockResolvedValue(
        `/api/avatars/${STAFF_ID}?variant=thumb&token=fresh`,
      );
    });

    it('lets an owner re-mint their own avatar URL', async () => {
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}/url?variant=thumb`)
        .set('Authorization', `Bearer ${STAFF_SELF}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatar_url).toContain('token=fresh');
      expect(avatarService.getAvatarUrl).toHaveBeenCalledWith(TENANT, STAFF_ID, 'thumb');
    });

    it('passes the full variant through', async () => {
      await request(app)
        .get(`/api/avatars/${STAFF_ID}/url?variant=full`)
        .set('Authorization', `Bearer ${STAFF_SELF}`);
      expect(avatarService.getAvatarUrl).toHaveBeenCalledWith(TENANT, STAFF_ID, 'full');
    });

    it('defaults to thumb when no variant is given', async () => {
      await request(app)
        .get(`/api/avatars/${STAFF_ID}/url`)
        .set('Authorization', `Bearer ${STAFF_SELF}`);
      expect(avatarService.getAvatarUrl).toHaveBeenCalledWith(TENANT, STAFF_ID, 'thumb');
    });

    it('401s without credentials', async () => {
      const res = await request(app).get(`/api/avatars/${STAFF_ID}/url?variant=thumb`);
      expect(res.status).toBe(401);
    });

    it('403s when someone without admin:update re-mints another account', async () => {
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}/url?variant=thumb`)
        .set('Authorization', `Bearer ${TEACHER}`);
      expect(res.status).toBe(403);
    });

    it('404s when the account has no photo', async () => {
      vi.spyOn(avatarService, 'getAvatarUrl').mockResolvedValue(null);
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}/url?variant=thumb`)
        .set('Authorization', `Bearer ${STAFF_SELF}`);
      expect(res.status).toBe(404);
    });

    it('404s (not 500) for a malformed id', async () => {
      const res = await request(app)
        .get('/api/avatars/not-a-uuid/url?variant=thumb')
        .set('Authorization', `Bearer ${IT_ADMIN}`);
      expect(res.status).toBe(404);
    });
  });

  // ── GET (the <img src> render path) ────────────────────────────────────────
  describe('GET /api/avatars/:id', () => {
    const token = (variant: 'full' | 'thumb', subject = STAFF_ID) =>
      avatarService.generateAvatarToken(subject, TENANT, variant);

    it('serves the bytes with image/webp and a private cache header', async () => {
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}?variant=full&token=${encodeURIComponent(token('full'))}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/webp/);
      expect(res.headers['cache-control']).toBe('private, max-age=86400');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('accepts a plain JWT in the Authorization header instead of a token', async () => {
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}?variant=thumb`)
        .set('Authorization', `Bearer ${IT_ADMIN}`);
      expect(res.status).toBe(200);
      expect(avatarService.getAvatarObject).toHaveBeenCalledWith(TENANT, STAFF_ID, 'thumb');
    });

    it('401s when neither a token nor a JWT is supplied', async () => {
      const res = await request(app).get(`/api/avatars/${STAFF_ID}?variant=thumb`);
      expect(res.status).toBe(401);
    });

    it('401s on a tampered token (signature check)', async () => {
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}?variant=full&token=${encodeURIComponent('forged.token.value')}`);
      expect(res.status).toBe(401);
    });

    it('401s when the token was minted for a DIFFERENT account (IDOR attempt)', async () => {
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}?variant=full&token=${encodeURIComponent(token('full', STUDENT_ID))}`);
      expect(res.status).toBe(401);
    });

    it('401s when the token variant does not match the request variant', async () => {
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}?variant=full&token=${encodeURIComponent(token('thumb'))}`);
      expect(res.status).toBe(401);
    });

    it('401s on an unknown variant instead of guessing', async () => {
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}?variant=huge&token=${encodeURIComponent(token('full'))}`);
      expect(res.status).toBe(401);
    });

    it('404s when the account has no photo', async () => {
      const { NotFoundError } = await import('../../utils/errors.js');
      vi.spyOn(avatarService, 'getAvatarObject').mockRejectedValue(new NotFoundError('Avatar', STAFF_ID));
      const res = await request(app)
        .get(`/api/avatars/${STAFF_ID}?variant=full&token=${encodeURIComponent(token('full'))}`);
      expect(res.status).toBe(404);
    });
  });
});