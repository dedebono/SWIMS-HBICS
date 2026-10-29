import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for case visibility scoping (ABAC).
 *
 * Bug: a case reported by account A was fully readable (list + detail +
 * incidents + shares/media/counseling) by ANY other TEACHER account in the
 * tenant, because `listCases`/`getCaseById` never applied any per-viewer
 * filter and `enforceAbac` only runs when a student_id is present in the
 * request. Teachers must only see cases they created, reported an incident
 * on, or that were explicitly shared with them.
 */

const { mockQueryWithTenant } = vi.hoisted(() => ({ mockQueryWithTenant: vi.fn() }));

vi.mock('../db/pool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/pool.js')>();
  return {
    ...actual,
    queryWithTenant: (...args: unknown[]) => mockQueryWithTenant(...args),
  };
});

import {
  caseVisibilityPredicate,
  isTeacherScoped,
  assertCaseVisible,
  assertIncidentVisible,
} from '../services/case-visibility.service.js';
import * as casesService from '../services/cases.service.js';

const TENANT = 'tenant-1';
const TEACHER_A = 'teacher-a';
const TEACHER_B = 'teacher-b';
const CASE_X = 'case-x'; // reported by teacher A, unrelated to teacher B

describe('caseVisibilityPredicate', () => {
  it('scopes to created_by OR reported incident OR explicit share', () => {
    const sql = caseVisibilityPredicate('c', '$3');
    expect(sql).toContain('c.created_by = $3');
    expect(sql).toContain('FROM incidents i');
    expect(sql).toContain('i.reported_by = $3');
    expect(sql).toContain('FROM case_shares cs');
    expect(sql).toContain('cs.shared_with = $3');
  });
});

describe('isTeacherScoped', () => {
  it('scopes TEACHER and SUBSTITUTE_TEACHER only', () => {
    expect(isTeacherScoped({ userId: 'u', role: 'TEACHER' })).toBe(true);
    expect(isTeacherScoped({ userId: 'u', role: 'SUBSTITUTE_TEACHER' })).toBe(true);
    expect(isTeacherScoped({ userId: 'u', role: 'SCHOOL_HEAD' })).toBe(false);
    expect(isTeacherScoped({ userId: 'u', role: 'COUNSELOR' })).toBe(false);
  });
});

describe('assertCaseVisible', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundError when a teacher has no relation to the case', async () => {
    mockQueryWithTenant.mockResolvedValue({ rows: [{ visible: false }] });
    await expect(
      assertCaseVisible(TENANT, CASE_X, { userId: TEACHER_B, role: 'TEACHER' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('passes when the case is shared with the teacher', async () => {
    mockQueryWithTenant.mockResolvedValue({ rows: [{ visible: true }] });
    await expect(
      assertCaseVisible(TENANT, CASE_X, { userId: TEACHER_B, role: 'TEACHER' }),
    ).resolves.toBeUndefined();
  });

  it('does not restrict SCHOOL_HEAD (tenant-wide reader)', async () => {
    await expect(
      assertCaseVisible(TENANT, CASE_X, { userId: 'head', role: 'SCHOOL_HEAD' }),
    ).resolves.toBeUndefined();
    expect(mockQueryWithTenant).not.toHaveBeenCalled();
  });
});

describe('assertIncidentVisible', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes for the reporting teacher even without case-level access', async () => {
    mockQueryWithTenant.mockResolvedValue({ rows: [{ visible: true }] });
    await expect(
      assertIncidentVisible(TENANT, 'inc-1', { userId: TEACHER_A, role: 'TEACHER' }),
    ).resolves.toBeUndefined();
  });

  it('throws NotFoundError for an unrelated teacher', async () => {
    mockQueryWithTenant.mockResolvedValue({ rows: [{ visible: false }] });
    await expect(
      assertIncidentVisible(TENANT, 'inc-1', { userId: TEACHER_B, role: 'TEACHER' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('listCases with teacher viewer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends the visibility predicate and viewer param to the query', async () => {
    mockQueryWithTenant
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValue({ rows: [] });

    await casesService.listCases(TENANT, {
      page: 1,
      limit: 20,
      viewer: { userId: TEACHER_A, role: 'TEACHER' },
    });

    const [, countSql, countParams] = mockQueryWithTenant.mock.calls[0]!;
    expect(String(countSql)).toContain('created_by = $2');
    expect(String(countSql)).toContain('case_shares');
    expect(countParams).toEqual([TENANT, TEACHER_A]);

    const [, dataSql] = mockQueryWithTenant.mock.calls[1]!;
    expect(String(dataSql)).toContain('created_by = $2');
  });

  it('returns everything for a non-teacher viewer (no predicate)', async () => {
    mockQueryWithTenant
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValue({ rows: [] });

    await casesService.listCases(TENANT, {
      page: 1,
      limit: 20,
      viewer: { userId: 'head', role: 'SCHOOL_HEAD' },
    });

    const [, countSql] = mockQueryWithTenant.mock.calls[0]!;
    expect(String(countSql)).not.toContain('case_shares');
  });
});
