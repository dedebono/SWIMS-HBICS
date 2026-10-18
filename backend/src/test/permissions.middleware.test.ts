import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Mock the pool BEFORE importing the middleware so the module binds to it ──
// vi.mock factories are hoisted above module-level consts, so the spies must be
// declared via vi.hoisted to exist at factory-evaluation time.
const { mockQuery, mockRelease } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRelease: vi.fn(),
}));

vi.mock('../db/pool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/pool.js')>();
  return {
    ...actual,
    pool: {
      ...actual.pool,
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: vi.fn().mockResolvedValue({
        query: (...args: unknown[]) => mockQuery(...args),
        release: mockRelease,
      }),
    },
  };
});

vi.mock('../services/role-permissions.service.js', () => ({
  getTenantPermissionMatrix: vi.fn().mockResolvedValue({}),
  ensureSeeded: vi.fn().mockResolvedValue(undefined),
}));

import { checkPermission } from '../middleware/permissions.middleware.js';

const TENANT = 'tenant-123';
const USER = 'user-123';

/**
 * Drive the middleware with a fake Express req/res. Returns the next() argument
 * (an Error when the request was denied, undefined when it passed).
 */
async function run(
  opts: {
    resource: Parameters<typeof checkPermission>[0];
    action: Parameters<typeof checkPermission>[1];
    role: string;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  },
): Promise<Error | undefined> {
  const req = {
    userRole: opts.role,
    userId: USER,
    tenantId: TENANT,
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: opts.query ?? {},
  } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;

  await checkPermission(opts.resource, opts.action)(req, {} as Response, next);

  const arg = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
  return arg as Error | undefined;
}

/**
 * Route a pool query by matching on a substring of the SQL.
 * Order matters: the class-scoped check and the "is scoping configured" probe
 * both hit `teacher_class_assignments`, so the join query must be matched first
 * (`JOIN student_enrollment_history` is unique to it).
 */
function mockCounts(counts: Array<[string, number]>) {
  mockQuery.mockImplementation(async (sql: string) => {
    for (const [needle, count] of counts) {
      if (sql.includes(needle)) return { rows: [{ count: String(count) }] };
    }
    return { rows: [] };
  });
}

const SCOPING_CONFIGURED: Array<[string, number]> = [
  // isStudentInTeacherClass() joins enrollment — must be matched before the probe
  ['JOIN student_enrollment_history', 0],
  ['FROM teacher_class_assignments', 3],
];

describe('permissions middleware — TEACHER class scoping ABAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tenant WITHOUT class scoping configured', () => {
    beforeEach(() => {
      // teacher_class_assignments count = 0, enrollment count = 0
      mockCounts([['FROM teacher_class_assignments', 0]]);
    });

    it('allows a teacher to act on a student outside their class (no class map exists)', async () => {
      const err = await run({
        resource: 'cases',
        action: 'read',
        role: 'TEACHER',
        body: { student_id: 'student-999' },
      });
      expect(err).toBeUndefined();
    });

    it('allows the counseling POST that carries student_id in the body', async () => {
      const err = await run({
        resource: 'cases',
        action: 'read',
        role: 'TEACHER',
        params: { caseId: 'case-1' },
        body: {
          student_id: 'student-999',
          answers: [],
          submitted_by: USER,
          parent_email: 'parent@school.id',
        },
      });
      expect(err).toBeUndefined();
    });

    it('never runs the enrollment join that would deny the student', async () => {
      await run({ resource: 'cases', action: 'read', role: 'TEACHER', body: { student_id: 's-1' } });
      const sqlSeen = mockQuery.mock.calls.map((c) => String(c[0])).join('\n');
      expect(sqlSeen).not.toContain('student_enrollment_history');
    });
  });

  describe('tenant WITH class scoping configured', () => {
    it('denies a student outside the teacher assigned class', async () => {
      // assignments exist, enrollment join returns 0 → denied
      mockCounts(SCOPING_CONFIGURED);

      const err = await run({
        resource: 'cases',
        action: 'read',
        role: 'TEACHER',
        body: { student_id: 'student-999' },
      });

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(
        'You can only access records for students in your assigned class',
      );
    });

    it('allows a student inside the teacher assigned class', async () => {
      mockCounts([
        ['JOIN student_enrollment_history', 1],
        ['FROM teacher_class_assignments', 3],
      ]);

      const err = await run({
        resource: 'cases',
        action: 'read',
        role: 'TEACHER',
        body: { student_id: 'student-in-class' },
      });

      expect(err).toBeUndefined();
    });
  });

  describe('existing exemptions are preserved', () => {
    beforeEach(() => {
      mockCounts(SCOPING_CONFIGURED);
    });

    it('skips the class check for students resource lookups', async () => {
      const err = await run({
        resource: 'students',
        action: 'read',
        role: 'TEACHER',
        params: { studentId: 'student-999' },
      });
      expect(err).toBeUndefined();
    });

    it('skips the class check for incident creation', async () => {
      const err = await run({
        resource: 'incidents',
        action: 'create',
        role: 'TEACHER',
        body: { student_id: 'student-999' },
      });
      expect(err).toBeUndefined();
    });

    it('skips the class check for case creation', async () => {
      const err = await run({
        resource: 'cases',
        action: 'create',
        role: 'TEACHER',
        body: { student_id: 'student-999' },
      });
      expect(err).toBeUndefined();
    });

    it('reads student_id from query string too (GET /cases?student_id=)', async () => {
      const err = await run({
        resource: 'cases',
        action: 'read',
        role: 'TEACHER',
        query: { student_id: 'student-999' },
      });
      expect(err?.message).toContain('assigned class');
    });
  });
});