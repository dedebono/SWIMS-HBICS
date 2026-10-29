import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route each SQL statement to a canned result by matching a substring.
const { mockQuery, calls, boundParams } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  calls: [] as string[],
  boundParams: [] as unknown[][],
}));

vi.mock('../../db/pool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/pool.js')>();
  return {
    ...actual,
    queryWithTenant: vi.fn(async (tenantId: string, sql: string, params: unknown[] = []) =>
      route(tenantId, sql, params),
    ),
  };
});

vi.mock('../../utils/audit-log.js', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

const referral = vi.hoisted(() => ({
  createReferralToken: vi.fn().mockResolvedValue({ token: 'tok-123', tokenId: 'tokid-1' }),
  sendReferralNotification: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('../psychologist-referral.service.js', () => referral);

/** The active appointment_* question list the teacher form renders. */
vi.mock('../quisioner-lists.service.js', () => ({
  getActiveListForDomain: vi.fn().mockResolvedValue({
    question_list_id: 'list-1',
    name: 'Skrining Awal SISWA',
  }),
}));

/**
 * Rows for the two questions the mocked submission uses. `q1` is the scored
 * multiple-choice option (score is recomputed server-side from
 * `quisioner_answers`), `q2` is optional so it never gates the submission.
 */
const QUESTION_ROWS = [
  { question_id: 'q1', question_text: 'Q1', question_type: 'multiple_choice', is_required: true },
  { question_id: 'q2', question_text: 'Q2', question_type: 'text', is_required: false },
];

/**
 * Score the mocked `q1` option returns. The branch under test ('internal' vs
 * 'professional') is decided by this, because validateCounselingAnswers
 * recomputes the total server-side from the option rows — never from the score
 * the caller sent. Set by `answers()` on each call.
 */
let optionScore = 0;

/** Option rows — `validateCounselingAnswers` recomputes the score from these. */
function answerRows(score: number) {
  return [{ question_id: 'q1', answer_text: 'x', score }];
}

import { submitCaseCounseling } from '../counseling.service.js';

const TENANT = 'tenant-1';
const CASE_ID = 'case-1';
const STUDENT = 'student-1';
const TEACHER = 'teacher-1'; // a real users row — created_for FKs here

/**
 * Build an answers payload whose total score decides the branch. The score is
 * mirrored onto `optionScore` so the mocked option row returns the same value —
 * the service recomputes the total from the option rows, not from this payload.
 */
function answers(total: number) {
  optionScore = total;
  return [{ question_id: 'q1', answer_text: 'x', score: total }];
}

/**
 * Shared routing for every mockImplementation in this file. Returns the canned
 * result for a statement, or null when it is not one of the known ones.
 */
async function route(tenantId: string, sql: string, params: unknown[] = []) {
  calls.push(sql.replace(/\s+/g, ' ').trim());
  boundParams.push(params);

  // Required-question set + answer options used by validateCounselingAnswers.
  if (sql.includes('FROM quisioner_questions') && sql.includes('is_required')) {
    return { rows: QUESTION_ROWS, rowCount: QUESTION_ROWS.length };
  }
  if (sql.includes('FROM quisioner_answers')) {
    return { rows: answerRows(optionScore), rowCount: 1 };
  }

  // counseling_submissions INSERT ... RETURNING
  if (sql.includes('INSERT INTO counseling_submissions')) {
    return {
      rows: [{
        submission_id: 'sub-1', tenant_id: tenantId, case_id: params[1],
        submitted_by: params[2], student_id: params[3],
        recommendation: 'professional', score: params[5], answers: [], submitted_at: new Date(),
      }],
      rowCount: 1,
    };
  }

  // counseling_submissions duplicate check → none
  if (sql.includes('FROM counseling_submissions')) return { rows: [] };

  // appointment lookup for the referral token
  if (sql.includes('SELECT appointment_id FROM appointments')) {
    return { rows: [{ appointment_id: 'appt-1' }] };
  }

  // parent contact lookup — must NOT reference parent_phone/parent_name
  if (sql.includes('FROM students s')) {
    return {
      rows: [
        {
          student_name: 'Ananda Test',
          parent_phone: '628123456789',
          tenant_slug: 'hbics',
        },
      ],
    };
  }

  return { rows: [], rowCount: 0 };
}

describe('submitCaseCounseling — appointment insert + parent notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    boundParams.length = 0;
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('inserts created_for as a USER id, never a student_id (FK is users(user_id))', async () => {
    await submitCaseCounseling(TENANT, {
      caseId: CASE_ID,
      answers: answers(3), // → 'internal' branch
      submitted_by: TEACHER,
      student_id: STUDENT,
    });

    const insert = calls.find((s) => s.includes('INSERT INTO appointments'));
    expect(insert).toBeDefined();

    const idx = calls.findIndex((s) => s.includes('INSERT INTO appointments'));
    // positional params: [tenantId, created_by, created_for, student_id, ...]
    const params = boundParams[idx];
    expect(params[2]).toBe(TEACHER);   // created_for → a users row, not a student
    expect(params[3]).toBe(STUDENT);   // student_id carries the student
  });

  it('never selects parent_phone/parent_name from students (columns do not exist)', async () => {
    await submitCaseCounseling(TENANT, {
      caseId: CASE_ID,
      answers: answers(9), // → 'professional' branch, sends notification
      submitted_by: TEACHER,
      student_id: STUDENT,
    });

    const studentQuery = calls.find((s) => s.includes('FROM students s'));
    expect(studentQuery).toBeDefined();
    expect(studentQuery).not.toContain('s.parent_phone');
    expect(studentQuery).not.toContain('s.parent_name');
    expect(studentQuery).toContain('s.phone_number');
  });

  it('sends the WhatsApp parent notification on the professional branch', async () => {
    await submitCaseCounseling(TENANT, {
      caseId: CASE_ID,
      answers: answers(9),
      submitted_by: TEACHER,
      student_id: STUDENT,
    });

    expect(referral.createReferralToken).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        studentId: STUDENT,
        parentPhone: '628123456789',
        studentName: 'Ananda Test',
        caseId: CASE_ID,
      }),
    );
    expect(referral.sendReferralNotification).toHaveBeenCalledWith(
      TENANT,
      '628123456789',
      'Bapak/Ibu',
      'Ananda Test',
      expect.stringContaining('/quisioner/psychologist-referral?t=hbics&token=tok-123'),
    );
  });

  it('skips the notification when the student has no parent phone on file', async () => {
    const pool = await import('../../db/pool.js');
    (pool.queryWithTenant as any).mockImplementation(async (t: string, sql: string, params: unknown[] = []) => {
      // Same routing as the default, but the parent lookup yields no phone.
      if (sql.includes('FROM students s')) {
        calls.push(sql.replace(/\s+/g, ' ').trim());
        boundParams.push(params);
        return { rows: [{ student_name: 'No Contact', parent_phone: null, tenant_slug: 'hbics' }] };
      }
      return route(t, sql, params);
    });

    await submitCaseCounseling(TENANT, {
      caseId: CASE_ID,
      answers: answers(9),
      submitted_by: TEACHER,
      student_id: STUDENT,
    });

    expect(referral.sendReferralNotification).not.toHaveBeenCalled();
  });

  it('still persists the submission when the notification fails (non-fatal)', async () => {
    referral.sendReferralNotification.mockRejectedValueOnce(new Error('WhatsApp gateway down'));

    await expect(
      submitCaseCounseling(TENANT, {
        caseId: CASE_ID,
        answers: answers(9),
        submitted_by: TEACHER,
        student_id: STUDENT,
      }),
    ).resolves.toBeDefined();
  });
});