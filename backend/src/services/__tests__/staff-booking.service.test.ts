import { describe, it, expect, vi, beforeEach } from 'vitest';

import { queryWithTenant } from '../../db/pool.js';
import * as avatarService from '../../services/avatar.service.js';
import * as service from '../staff-booking.service.js';

vi.mock('../../db/pool.js', () => ({ queryWithTenant: vi.fn() }));
vi.mock('../../utils/audit-log.js', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../services/appointments.service.js', () => ({
  createAppointment: vi.fn(),
  confirmAppointment: vi.fn(),
  updateAvailabilitySlot: vi.fn(),
}));
vi.mock('../../services/notifications.service.js', () => ({ sendNotificationToUser: vi.fn() }));

const TENANT = 'tenant-123';
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';

const SLOT = {
  slot_id: '33333333-3333-4333-8333-333333333333',
  slot_start: new Date('2026-11-02T09:00:00Z'),
  slot_end: new Date('2026-11-02T10:00:00Z'),
};

/**
 * Route the two queries the service issues: the counselor roster, then each
 * counselor's availability slots.
 */
function mockDb(counselors: Record<string, unknown>[], slots: Record<string, unknown>[] = [SLOT]) {
  (queryWithTenant as any).mockImplementation(async (_t: string, sql: string) => {
    if (/role\s*=\s*'COUNSELOR'/.test(sql)) return { rows: counselors, rowCount: counselors.length };
    if (/FROM availability_slots/.test(sql)) return { rows: slots, rowCount: slots.length };
    return { rows: [], rowCount: 0 };
  });
}

describe('staff-booking.service — listCounselorAvailability', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('counselor photo', () => {
    it('returns a signed thumb URL for a counselor who has a photo', async () => {
      mockDb([
        {
          user_id: C1,
          full_name: 'Konselor Satu',
          gender: 'female',
          avatar_key: `avatars/${TENANT}/abc`,
          avatar_updated_at: new Date('2026-10-01T08:00:00Z'),
        },
      ]);

      const [c] = await service.listCounselorAvailability(TENANT);

      expect(c!.thumb_url).toContain(`/api/avatars/${C1}`);
      expect(c!.thumb_url).toContain('variant=thumb');
      // The token is what lets a bare <img> load it — no Authorization header
      // is possible on this public page.
      expect(c!.thumb_url).toMatch(/token=[^&]+/);
      // avatar_updated_at becomes the cache-buster.
      expect(c!.thumb_url).toContain(`v=${new Date('2026-10-01T08:00:00Z').getTime()}`);
    });

    it('returns null thumb_url when the counselor has no photo', async () => {
      mockDb([
        {
          user_id: C1,
          full_name: 'Konselor Tanpa Foto',
          gender: 'male',
          avatar_key: null,
          avatar_updated_at: null,
        },
      ]);

      const [c] = await service.listCounselorAvailability(TENANT);

      expect(c!.thumb_url).toBeNull();
    });

    it('does not fetch the avatar row again — the URL comes from the roster query', async () => {
      // One query per counselor for slots + one for the roster. A per-counselor
      // getAvatarUrl() lookup would double it on a PUBLIC endpoint.
      mockDb([
        { user_id: C1, full_name: 'A', gender: 'male', avatar_key: 'k1', avatar_updated_at: null },
        { user_id: C2, full_name: 'B', gender: 'female', avatar_key: 'k2', avatar_updated_at: null },
      ]);
      const spy = vi.spyOn(avatarService, 'getAvatarUrl');

      await service.listCounselorAvailability(TENANT);

      expect(spy).not.toHaveBeenCalled();
      expect((queryWithTenant as any).mock.calls.length).toBe(3); // 1 roster + 2 slot lookups
    });

    it('passes the TENANT id into the signed URL so a token cannot cross schools', async () => {
      mockDb([
        { user_id: C1, full_name: 'A', gender: 'male', avatar_key: 'k1', avatar_updated_at: null },
      ]);

      const [c] = await service.listCounselorAvailability(TENANT);
      const url = new URL(c!.thumb_url!, 'http://x');

      // tenant is only inside the HMAC token, so decode and assert it.
      const payload = JSON.parse(
        Buffer.from(url.searchParams.get('token')!, 'base64url').toString('utf8'),
      );
      expect(payload.tenant).toBe(TENANT);
      expect(payload.sub).toBe(C1);
      expect(payload.variant).toBe('thumb');
    });

    it('still returns counselors with zero slots (page filters them out)', async () => {
      mockDb(
        [{ user_id: C1, full_name: 'A', gender: 'male', avatar_key: 'k1', avatar_updated_at: null }],
        [],
      );

      const [c] = await service.listCounselorAvailability(TENANT);

      expect(c!.slots).toEqual([]);
      expect(c!.thumb_url).toContain('/api/avatars/');
    });
  });
});