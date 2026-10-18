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
    queryWithTenant: vi.fn(async (tenantId: string, sql: string, params: unknown[] = []) => {
      calls.push(sql.replace(/\s+/g, ' ').trim());
      boundParams.push(params);

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
    }),
  };
});

vi.mock('../../utils/audit-log.js', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

const referral = vi.hoisted(() => ({
  createReferralToken: vi.fn().mockResolvedValue({ token: 'tok-123', tokenId: 'tokid-1' }),
  sendReferralNotification: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('../psychologist-referral.service.js', () => referral);

import { submitCaseCounseling } from '../counseling.service.js';

const TENANT = 'tenant-1';
const CASE_ID = 'case-1';
const STUDENT = 'student-1';
const TEACHER = 'teacher-1'; // a real users row — created_for FKs here

/** Build an answers payload whose total score decides the branch. */
function answers(total: number) {
  return [{ question_id: 'q1', answer_text: 'x', score: total }];
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

  it('sends the WAHA parent notification on the professional branch', async () => {
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
    (pool.queryWithTenant as any).mockImplementation(async (_t: string, sql: string, params: unknown[] = []) => {
      calls.push(sql.replace(/\s+/g, ' ').trim());
      boundParams.push(params);
      if (sql.includes('INSERT INTO counseling_submissions')) {
        return { rows: [{ submission_id: 'sub-1', student_id: STUDENT, recommendation: 'professional', score: 9, answers: [], submitted_at: new Date() }] };
      }
      if (sql.includes('FROM counseling_submissions')) return { rows: [] };
      if (sql.includes('SELECT appointment_id FROM appointments')) return { rows: [{ appointment_id: 'appt-1' }] };
      if (sql.includes('FROM students s')) {
        return { rows: [{ student_name: 'No Contact', parent_phone: null, tenant_slug: 'hbics' }] };
      }
      return { rows: [], rowCount: 0 };
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
    referral.sendReferralNotification.mockRejectedValueOnce(new Error('WAHA down'));

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