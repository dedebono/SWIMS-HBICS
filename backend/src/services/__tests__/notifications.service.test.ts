import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryWithTenant } from '../../db/pool.js';
import * as service from '../notifications.service.js';

/**
 * In-app notifications are SIDE EFFECTS of business flows (create a case →
 * notify teachers), so every write helper must swallow its own failures and
 * every read/action helper must answer honestly. These tests pin both halves.
 */

const TENANT = 'tenant-123';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function lastCall(): { sql: string; params: unknown[] } {
  const calls = (queryWithTenant as any).mock.calls;
  const [tenant, sql, params = []] = calls[calls.length - 1];
  return { sql: sql as string, params: params as unknown[] };
}

describe('notifications.service — write helpers never throw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createNotification inserts one row for one recipient', async () => {
    const row = { notification_id: 'n1', title: 'Kasus baru' };
    (queryWithTenant as any).mockResolvedValueOnce({ rows: [row], rowCount: 1 });

    const res = await service.createNotification(TENANT, {
      user_id: USER_A,
      type: 'CASE_NEW',
      title: 'Kasus baru',
      body: 'Kasus bullying untuk Budi.',
      link: `/dashboard/cases/c1`,
    });

    expect(res).toMatchObject({ notification_id: 'n1' });
    const { sql, params } = lastCall();
    expect(sql).toContain('INSERT INTO notifications');
    expect(params).toEqual([TENANT, USER_A, 'CASE_NEW', 'Kasus baru', 'Kasus bullying untuk Budi.', '/dashboard/cases/c1']);
  });

  it('createNotification returns null (not a throw) when the INSERT fails', async () => {
    (queryWithTenant as any).mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      service.createNotification(TENANT, { user_id: USER_A, type: 'CASE_NEW', title: 'x' }),
    ).resolves.toBeNull();
  });

  it('createNotification skips a falsy user_id', async () => {
    const res = await service.createNotification(TENANT, {
      user_id: '' as unknown as string,
      type: 'CASE_NEW',
      title: 'x',
    });
    expect(res).toBeNull();
    expect(queryWithTenant).not.toHaveBeenCalled();
  });

  it('notifyUsers dedupes recipients and excludes the actor', async () => {
    (queryWithTenant as any).mockResolvedValue({ rows: [{ notification_id: 'n' }], rowCount: 1 });

    await service.notifyUsers(
      TENANT,
      [USER_A, USER_B, USER_A, null, undefined, ''],
      { type: 'CASE_SHARED', title: 'Kasus dibagikan' },
      { excludeUserId: USER_A },
    );

    expect(queryWithTenant).toHaveBeenCalledTimes(1);
    expect(lastCall().params[1]).toBe(USER_B);
  });

  it('notifyRoles fans out to every active user holding the role', async () => {
    (queryWithTenant as any)
      .mockResolvedValueOnce({ rows: [{ user_id: USER_A }, { user_id: USER_B }], rowCount: 2 })
      .mockResolvedValue({ rows: [{ notification_id: 'n' }], rowCount: 1 });

    await service.notifyRoles(TENANT, ['TEACHER'], { type: 'CASE_NEW', title: 'Kasus baru' });

    const calls = (queryWithTenant as any).mock.calls;
    expect(calls[0][1]).toContain('FROM users');
    expect(calls[0][1]).toContain('is_active = true');
    expect(calls.length).toBe(3); // 1 roster + 2 inserts
  });
});

describe('notifications.service — notifySystemError throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('collapses a duplicate unread error inside the throttle window', async () => {
    (queryWithTenant as any).mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });

    await service.notifySystemError(TENANT, { message: 'boom', path: '/api/x' });

    expect(queryWithTenant).toHaveBeenCalledTimes(1); // only the COUNT — no insert
    expect(lastCall().sql).toContain('COUNT(*)');
  });

  it('notifies admins when the error is new', async () => {
    (queryWithTenant as any)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    await service.notifySystemError(TENANT, { message: 'boom', path: '/api/x' });

    const calls = (queryWithTenant as any).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2); // COUNT + roster + inserts
    expect(calls[1][1]).toContain('FROM users');
  });
});

describe('notifications.service — notifyProfessional picks the dashboard link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['COUNSELOR', '/dashboard/counselor'],
    ['PSYCHOLOGIST', '/dashboard/psychologist'],
    ['SCHOOL_NURSE', '/dashboard/nurse'],
  ])('links %s to its dashboard', async (role, expectedLink) => {
    (queryWithTenant as any)
      .mockResolvedValueOnce({ rows: [{ role }], rowCount: 1 })
      .mockResolvedValue({ rows: [{ notification_id: 'n' }], rowCount: 1 });

    await service.notifyProfessional(TENANT, USER_A, {
      type: 'APPOINTMENT_REQUEST',
      title: 'Permintaan janji temu baru',
    });

    const { params } = lastCall();
    expect(params[1]).toBe(USER_A);
    expect(params[5]).toBe(expectedLink);
  });

  it('falls back to /dashboard for an unknown role', async () => {
    (queryWithTenant as any)
      .mockResolvedValueOnce({ rows: [{ role: 'SOMETHING_ELSE' }], rowCount: 1 })
      .mockResolvedValue({ rows: [{ notification_id: 'n' }], rowCount: 1 });

    await service.notifyProfessional(TENANT, USER_A, { type: 'SCHEDULE_NEW', title: 'Jadwal baru' });

    expect(lastCall().params[5]).toBe('/dashboard');
  });
});

describe('notifications.service — inbox reads & actions MAY throw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('countUnread counts only active, undismissed, unread rows', async () => {
    (queryWithTenant as any).mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });

    await expect(service.countUnread(TENANT, USER_A)).resolves.toBe(7);
    expect(lastCall().sql).toContain('is_read = false');
    expect(lastCall().sql).toContain('dismissed_at IS NULL');
  });

  it('markNotificationRead scopes by user — another user cannot flip my row', async () => {
    (queryWithTenant as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      service.markNotificationRead(TENANT, USER_B, 'n1', true),
    ).resolves.toBeNull();
    expect(lastCall().params).toEqual([TENANT, USER_B, 'n1', true]);
  });

  it('deleteNotification soft-deletes', async () => {
    (queryWithTenant as any).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(service.deleteNotification(TENANT, USER_A, 'n1')).resolves.toBe(true);
    expect(lastCall().sql).toContain('SET deleted_at = now()');
  });

  it('clearDismissedNotifications purges only dismissed rows', async () => {
    (queryWithTenant as any).mockResolvedValueOnce({ rows: [], rowCount: 4 });

    await expect(service.clearDismissedNotifications(TENANT, USER_A)).resolves.toBe(4);
    expect(lastCall().sql).toContain('dismissed_at IS NOT NULL');
  });
});
