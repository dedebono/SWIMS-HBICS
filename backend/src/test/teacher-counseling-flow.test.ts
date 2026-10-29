import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Regression tests for the teacher "Janji Temu" flow:
 *
 *  1. TEACHER must be able to READ appointments (was 403 on
 *     GET /api/appointments?type=student&student_id=…).
 *  2. validateCounselingAnswers must only require answers for the questions the
 *     teacher form actually renders (the active appointment_* question list),
 *     not every question row in the tenant.
 *  3. The score-recompute step must not reference quisioner_answers.tenant_id —
 *     that column does not exist.
 */

const { mockQuery, mockRelease, mockCounselingQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRelease: vi.fn(),
  mockCounselingQuery: vi.fn(),
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
    // submitCaseCounseling imports queryWithTenant by name; give it its own spy.
    queryWithTenant: vi.fn(async (...args: unknown[]) => mockCounselingQuery(...args)),
  };
});

vi.mock('../utils/audit-log.js', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

import { checkPermission } from '../middleware/permissions.middleware.js';
import { PERMISSIONS } from '@swims/shared';

const TENANT = 'tenant-123';
const USER = 'user-123';
const ACTIVE_LIST = 'list-appointment';
const STUDENT = 'student-1';
const CASE = 'case-1';

async function runPermission(opts: {
  resource: Parameters<typeof checkPermission>[0];
  action: Parameters<typeof checkPermission>[1];
  role: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Promise<Error | undefined> {
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

// ─── 1. TEACHER can read appointments ────────────────────────────────────────

describe('TEACHER appointments permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No teacher_class_assignments rows → class scoping degrades to tenant-wide.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM teacher_class_assignments')) return { rows: [{ count: '0' }] };
      return { rows: [] };
    });
  });

  it('static matrix grants TEACHER read on appointments', () => {
    expect(PERMISSIONS.TEACHER.appointments.read).toBe(true);
  });

  it('does NOT grant TEACHER write on appointments (read-only is enough)', () => {
    expect(PERMISSIONS.TEACHER.appointments.create).toBe(false);
    expect(PERMISSIONS.TEACHER.appointments.update).toBe(false);
    expect(PERMISSIONS.TEACHER.appointments.delete).toBe(false);
  });

  it('allows GET /appointments?type=student&student_id=… for a TEACHER', async () => {
    const err = await runPermission({
      resource: 'appointments',
      action: 'read',
      role: 'TEACHER',
      query: { type: 'student', student_id: STUDENT },
    });
    expect(err).toBeUndefined();
  });

  it('still denies TEACHER creating an appointment directly', async () => {
    const err = await runPermission({
      resource: 'appointments',
      action: 'create',
      role: 'TEACHER',
      body: { student_id: STUDENT },
    });
    expect(err).toBeInstanceOf(Error);
  });

  it('still denies TEACHER reading audit logs', async () => {
    const err = await runPermission({
      resource: 'audit_logs',
      action: 'read',
      role: 'TEACHER',
    });
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── 2 & 3. Counseling submission validation ──────────────────────────────────

/** The 3 questions the teacher form renders (all in the active appointment list). */
const VISIBLE_QUESTIONS = [
  { question_id: 'q1', question_text: 'Q1', question_type: 'multiple_choice', is_required: true },
  { question_id: 'q2', question_text: 'Q2', question_type: 'rating', is_required: true },
  { question_id: 'q3', question_text: 'Q3', question_type: 'text', is_required: true },
];

/** A required question from a DIFFERENT list — the teacher never sees this one. */
const ORPHAN_QUESTION = {
  question_id: 'q-orphan',
  question_text: 'Apa yang anda alami?',
  question_type: 'text',
  is_required: true,
};

const ANSWERS_FOR_VISIBLE = [
  { question_id: 'q1', answer_text: 'ya', score: 3 },
  { question_id: 'q2', answer_text: 'baik', score: 2 },
  { question_id: 'q3', answer_text: 'siswa Diam', score: 0 },
];

/**
 * Route every queryWithTenant call by SQL substring.
 * `validationQuerySet` controls whether the required-questions lookup returns
 * only the active list (fixed behaviour) or the whole tenant table (old bug).
 */
function mockCounselingDb(opts: { validationQuerySet: 'scoped' | 'all' }) {
  // queryWithTenant(tenantId, text, params) — SQL is the SECOND argument.
  mockCounselingQuery.mockImplementation(async (_tenantId: string, sql: string) => {
    if (sql.includes('quisioner_question_lists')) {
      return { rows: [{ question_list_id: ACTIVE_LIST, name: 'Skrining Awal SISWA' }] };
    }
    if (sql.includes('FROM quisioner_questions') && sql.includes('question_text')) {
      if (opts.validationQuerySet === 'scoped') {
        // Fixed: the list filter is present, so only visible questions return.
        expect(sql).toContain('question_list_id = $2');
        return { rows: VISIBLE_QUESTIONS };
      }
      return { rows: [...VISIBLE_QUESTIONS, ORPHAN_QUESTION] };
    }
    if (sql.includes('quisioner_answers')) {
      return {
        rows: [
          { question_id: 'q1', answer_text: 'ya', score: 3 },
          { question_id: 'q2', answer_text: 'baik', score: 2 },
        ],
      };
    }
    if (sql.includes('SELECT submission_id')) return { rows: [] };
    if (sql.includes('INSERT INTO counseling_submissions')) {
      return {
        rows: [
          {
            submission_id: 'sub-1',
            tenant_id: TENANT,
            case_id: CASE,
            submitted_by: USER,
            student_id: STUDENT,
            recommendation: 'professional',
            score: 5,
            answers: [],
            submitted_at: new Date(),
          },
        ],
      };
    }
    return { rows: [] };
  });
}

async function submit() {
  const { submitCaseCounseling } = await import('../services/counseling.service.js');
  return submitCaseCounseling(TENANT, {
    caseId: CASE,
    answers: ANSWERS_FOR_VISIBLE,
    submitted_by: USER,
    student_id: STUDENT,
  });
}

describe('validateCounselingAnswers — only validates questions the teacher sees', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('accepts a fully-completed form (the regression: was "Lengkapi 1 pertanyaan wajib")', async () => {
    mockCounselingDb({ validationQuerySet: 'scoped' });
    const result = await submit();
    expect(result.submission_id).toBe('sub-1');
  });

  it('confirms the list filter is applied to the required-questions query', async () => {
    mockCounselingDb({ validationQuerySet: 'scoped' });
    await submit();
    const validationSql = mockCounselingQuery.mock.calls
      .map((c: unknown[]) => String(c[1]))
      .find((s: string) => s.includes('is_required'));
    expect(validationSql).toContain('question_list_id = $2');
  });

  it('still rejects a genuinely incomplete form', async () => {
    mockCounselingDb({ validationQuerySet: 'scoped' });
    // Answer only q1 — q2 and q3 are required and visible.
    const { submitCaseCounseling } = await import('../services/counseling.service.js');
    await expect(
      submitCaseCounseling(TENANT, {
        caseId: CASE,
        answers: [{ question_id: 'q1', answer_text: 'ya', score: 3 }],
        submitted_by: USER,
        student_id: STUDENT,
      }),
    ).rejects.toThrow(/Lengkapi 2 pertanyaan wajib/);
  });

  it('demonstrates the old bug: unscoped query rejects a complete form', async () => {
    mockCounselingDb({ validationQuerySet: 'all' });
    // Proves the test above is meaningful — with the tenant-wide question set
    // the orphan required question makes submission fail.
    await expect(submit()).rejects.toThrow(/Lengkapi 1 pertanyaan wajib/);
  });
});

describe('duplicate submission is a 409 Conflict, not a 500', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects with ConflictError (statusCode 409) when already submitted', async () => {
    mockCounselingQuery.mockImplementation(async (_tenantId: string, sql: string) => {
      if (sql.includes('quisioner_question_lists')) {
        return { rows: [{ question_list_id: ACTIVE_LIST }] };
      }
      if (sql.includes('FROM quisioner_questions') && sql.includes('is_required')) {
        return { rows: VISIBLE_QUESTIONS };
      }
      if (sql.includes('FROM quisioner_answers')) {
        return { rows: [{ question_id: 'q1', answer_text: 'ya', score: 3 }] };
      }
      // The duplicate-check lookup now finds an existing submission.
      if (sql.includes('FROM counseling_submissions')) {
        return { rows: [{ submission_id: 'sub-existing' }] };
      }
      return { rows: [] };
    });

    const { submitCaseCounseling } = await import('../services/counseling.service.js');
    const { ConflictError } = await import('../utils/errors.js');

    await expect(
      submitCaseCounseling(TENANT, {
        caseId: CASE,
        answers: ANSWERS_FOR_VISIBLE,
        submitted_by: USER,
        student_id: STUDENT,
      }),
    ).rejects.toThrow(ConflictError);

    // The error handler maps AppError.statusCode, so a plain Error here would
    // have surfaced as a generic 500 to the teacher.
    const { AppError } = await import('../utils/errors.js');
    await submitCaseCounseling(TENANT, {
      caseId: CASE,
      answers: ANSWERS_FOR_VISIBLE,
      submitted_by: USER,
      student_id: STUDENT,
    }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(AppError);
      expect((e as InstanceType<typeof AppError>).statusCode).toBe(409);
    });
  });
});

describe('score recompute does not reference quisioner_answers.tenant_id', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCounselingDb({ validationQuerySet: 'scoped' });
  });

  it('joins quisioner_questions for tenant scoping instead', async () => {
    await submit();
    const optionsSql = mockCounselingQuery.mock.calls
      .map((c: unknown[]) => String(c[1]))
      .find((s: string) => s.includes('FROM quisioner_answers'));
    expect(optionsSql).toBeDefined();
    expect(optionsSql).not.toMatch(/quisioner_answers\s+WHERE\s+tenant_id/i);
    expect(optionsSql).toContain('JOIN quisioner_questions');
    expect(optionsSql).toContain('qq.tenant_id = $1');
  });

  it('recomputes the score server-side from the real option scores', async () => {
    await submit();
    const insertCall = mockCounselingQuery.mock.calls.find((c: unknown[]) =>
      String(c[1]).includes('INSERT INTO counseling_submissions'),
    );
    const params = insertCall?.[2] as unknown[];
    // q1=3 + q2=2 + q3=0 (free text has no option row) → 5
    expect(params[5]).toBe(5);
  });
});