import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { pool } from '../../db/pool.js';

/**
 * DELETE /api/admin/users/:id backs the "Hapus Pengguna" button in Manajemen
 * Pengguna, which is why the UI demands the admin type HAPUS first. Two things
 * must hold server-side no matter what the UI does:
 *
 *  - an admin cannot delete their OWN account (that locks the school out), and
 *  - deleting reports failure when nothing matched, rather than a false success.
 */

const TENANT = 'tenant-123';
const ADMIN_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const OTHER_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const STUDENT_ID = 'cccccccc-3333-4333-8333-333333333333';

describe('DELETE /api/admin/users/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('../../services/avatar.service.js', () => ({
      deleteAvatarFiles: vi.fn().mockResolvedValue(undefined),
    }));
  });

  /** Point the pool at a scripted account table + UPDATE outcome. */
  function mockDb(opts: {
    resolvesTo?: 'users' | 'students' | null;
    userRow?: { avatar_key: string | null } | null;
    studentUpdated?: number;
  }) {
    (pool.query as any).mockImplementation(async (sql: string, params: unknown[] = []) => {
      // setTenantContext verifies the tenant is alive before every route runs.
      if (/FROM tenants/i.test(sql)) {
        return { rows: [{ tenant_id: TENANT }], rowCount: 1 };
      }
      // resolveAccountTable: probe users, then students
      if (/FROM users/i.test(sql) && /user_id/.test(sql) && !/UPDATE/i.test(sql)) {
        return { rows: opts.resolvesTo === 'users' ? [{ user_id: params[0] }] : [], rowCount: opts.resolvesTo === 'users' ? 1 : 0 };
      }
      if (/FROM students/i.test(sql) && !/UPDATE/i.test(sql)) {
        return { rows: opts.resolvesTo === 'students' ? [{ student_id: params[0] }] : [], rowCount: opts.resolvesTo === 'students' ? 1 : 0 };
      }
      if (/UPDATE users/i.test(sql)) {
        const row = opts.userRow;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/UPDATE students/i.test(sql)) {
        return { rows: [], rowCount: opts.studentUpdated ?? 1 };
      }
      return { rows: [], rowCount: 0 };
    });
  }

  it('refuses to delete the admin own account (would lock the school out)', async () => {
    mockDb({ resolvesTo: 'users', userRow: { avatar_key: null } });
    const token = generateTestToken(TENANT, ADMIN_ID, 'IT_ADMIN');

    const res = await request(app)
      .delete(`/api/admin/users/${ADMIN_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // sendError puts the message in `error` as a plain string.
    expect(res.body.error).toMatch(/tidak dapat menghapus akun Anda sendiri/i);
  });

  it('rejects the self-delete before touching the database', async () => {
    mockDb({ resolvesTo: 'users', userRow: { avatar_key: 'k' } });
    const token = generateTestToken(TENANT, ADMIN_ID, 'IT_ADMIN');

    await request(app)
      .delete(`/api/admin/users/${ADMIN_ID}`)
      .set('Authorization', `Bearer ${token}`);

    const ranUpdate = (pool.query as any).mock.calls.some(
      ([sql]: [string]) => /UPDATE\s+users/i.test(sql),
    );
    expect(ranUpdate).toBe(false);
  });

  it('soft-deletes another staff account', async () => {
    mockDb({ resolvesTo: 'users', userRow: { avatar_key: null } });
    const token = generateTestToken(TENANT, ADMIN_ID, 'IT_ADMIN');

    const res = await request(app)
      .delete(`/api/admin/users/${OTHER_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(res.body.data.type).toBe('STAFF');
  });

  it('soft-deletes a student without touching the users table', async () => {
    mockDb({ resolvesTo: 'students', studentUpdated: 1 });
    const token = generateTestToken(TENANT, ADMIN_ID, 'IT_ADMIN');

    const res = await request(app)
      .delete(`/api/admin/users/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('STUDENT');
  });

  it('404s when the UPDATE matched no row instead of claiming success', async () => {
    // The account resolved, but it was already soft-deleted in the meantime.
    mockDb({ resolvesTo: 'users', userRow: null });
    const token = generateTestToken(TENANT, ADMIN_ID, 'IT_ADMIN');

    const res = await request(app)
      .delete(`/api/admin/users/${OTHER_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('404s when the account does not exist at all', async () => {
    mockDb({ resolvesTo: null });
    const token = generateTestToken(TENANT, ADMIN_ID, 'IT_ADMIN');

    const res = await request(app)
      .delete(`/api/admin/users/${OTHER_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    mockDb({ resolvesTo: 'users', userRow: { avatar_key: null } });

    const res = await request(app).delete(`/api/admin/users/${OTHER_ID}`);

    expect(res.status).toBe(401);
  });

  it('still succeeds when avatar cleanup fails — the delete itself matters more', async () => {
    mockDb({ resolvesTo: 'users', userRow: { avatar_key: 'avatars/x/k' } });
    const { deleteAvatarFiles } = await import('../../services/avatar.service.js');
    (deleteAvatarFiles as any).mockRejectedValue(new Error('volume offline'));

    const token = generateTestToken(TENANT, ADMIN_ID, 'IT_ADMIN');
    const res = await request(app)
      .delete(`/api/admin/users/${OTHER_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });
});