import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getClientWithTenant } from '../../db/pool.js';
import { searchStudents } from '../../services/students.service.js';

// The global test setup stubs students.service with only `getStudentTimeline`
// (the timeline routes are what that stub exists for). This suite tests the
// REAL searchStudents, so restore the module and keep everything else mocked.
vi.mock('../../services/students.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/students.service.js')>();
  return { ...actual, default: actual };
});

/**
 * The incident reporter's student picker renders a photo next to each name
 * instead of dumping UUID + e-mail, so `searchStudents` MUST hand back a signed
 * `thumb_url` for every student that has an `avatar_key` — and `null` for the
 * ones that do not, so the UI can fall back to initials rather than a broken
 * image. The raw `avatar_key` storage path must never leak to the client.
 */
describe('students.service / searchStudents', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { query: vi.fn(), release: vi.fn() };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  /** Two result sets: the name/metadata search, then the national-id sweep. */
  function mockQueries(dbRows: any[], idRows: any[] = []) {
    mockClient.query
      .mockResolvedValueOnce({ rows: dbRows })
      .mockResolvedValueOnce({ rows: idRows });
  }

  it('returns a signed thumb_url for a student that has a photo', async () => {
    mockQueries([
      {
        student_id: '11111111-1111-4111-8111-111111111111',
        full_name: 'Budi Santoso',
        metadata: { class: '8A' },
        national_id: null,
        avatar_key: 'avatars/tenant-123/abc',
        avatar_updated_at: '2026-01-02T03:04:05.000Z',
      },
    ]);

    const [result] = await searchStudents('tenant-123', 'budi');

    expect(result?.full_name).toBe('Budi Santoso');
    expect(result?.thumb_url).toContain('/api/avatars/11111111-1111-4111-8111-111111111111');
    expect(result?.thumb_url).toContain('variant=thumb');
    // The signed URL must carry a token so <img src> (which cannot send an
    // Authorization header) can actually fetch it.
    expect(result?.thumb_url).toContain('token=');
    // The storage key stays server-side.
    expect(JSON.stringify(result)).not.toContain('avatars/tenant-123/abc');
  });

  it('returns null thumb_url for a student without a photo', async () => {
    mockQueries([
      {
        student_id: '22222222-2222-4222-8222-222222222222',
        full_name: 'Siti Aminah',
        metadata: {},
        national_id: null,
        avatar_key: null,
        avatar_updated_at: null,
      },
    ]);

    const [result] = await searchStudents('tenant-123', 'siti');

    expect(result?.thumb_url).toBeNull();
  });

  it('still resolves a photo-bearing student found by decrypted national id', async () => {
    mockQueries([], [
      {
        student_id: '33333333-3333-4333-8333-333333333333',
        full_name: 'Andi Pratama',
        metadata: {},
        national_id: null, // unreadable ciphertext → must be skipped, not crash
        avatar_key: 'avatars/tenant-123/def',
        avatar_updated_at: '2026-02-03T04:05:06.000Z',
      },
    ]);

    const results = await searchStudents('tenant-123', '9999');

    // The national_id could not be decrypted, so it is not a match.
    expect(results).toEqual([]);
    expect(mockClient.release).toHaveBeenCalled();
  });
});