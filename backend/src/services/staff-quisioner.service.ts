import { queryWithTenant, getClientWithTenant } from '../db/pool.js';
import { calculateScore, getRecommendation } from './quisioner.service.js';
import { createAppointment } from './appointments.service.js';
import * as settingsService from './quisioner-settings.service.js';
import { hashNationalId } from '../utils/encryption.js';
import { auditLog } from '../utils/audit-log.js';
import { sendNotificationToUser } from './notifications.service.js';
import type { StaffQuisionerSubmissionWithStaff } from '@swims/shared';

export async function verifyNik(tenantId: string, nik: string): Promise<{ valid: boolean; staff_name?: string }> {
  if (!nik || !nik.trim()) return { valid: false };
  const hash = hashNationalId(nik);
  const { rows } = await queryWithTenant<{ user_id: string; full_name: string }>(
    tenantId,
    `SELECT user_id, full_name FROM users
     WHERE tenant_id = $1 AND national_id_hash = $2 AND role = 'PERSONAL' AND is_active = true`,
    [tenantId, hash],
  );
  return rows[0] ? { valid: true, staff_name: rows[0].full_name } : { valid: false };
}

export async function submitStaffQuisioner(
  tenantId: string,
  data: { nik: string; answers: Array<{ question_id: string; answer_text?: string; score: number }> },
) {
  const v = await verifyNik(tenantId, data.nik);
  if (!v.valid) {
    const err: any = new Error('NIK tidak terdaftar sebagai staff.');
    err.statusCode = 422;
    throw err;
  }
  const { rows: staff } = await queryWithTenant<{ user_id: string }>(
    tenantId,
    `SELECT user_id FROM users
     WHERE tenant_id = $1 AND national_id_hash = $2 AND role = 'PERSONAL' AND is_active = true`,
    [tenantId, hashNationalId(data.nik)],
  );
  const staffUserId = staff[0]!.user_id;

  const settings = await settingsService.getSettings(tenantId);
  const score = await calculateScore(data.answers);
  const recommendation = await getRecommendation(score, settings.threshold);

  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO staff_quisioner_submissions (tenant_id, staff_user_id, total_score, recommendation, answers)
       VALUES ($1, $2, $3, $4, $5) RETURNING submission_id`,
      [tenantId, staffUserId, score, recommendation, JSON.stringify(data.answers)],
    );
    await client.query('COMMIT');
    return { submission_id: rows[0].submission_id, score, recommendation };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function listStaffSubmissions(
  tenantId: string,
  opts: { status?: string } = {},
): Promise<StaffQuisionerSubmissionWithStaff[]> {
  const params: unknown[] = [tenantId];
  let sql = `
    SELECT s.*, u.full_name AS staff_name, u.gender AS staff_gender, u.email AS staff_email
    FROM staff_quisioner_submissions s
    JOIN users u ON u.user_id = s.staff_user_id
    WHERE s.tenant_id = $1 AND s.deleted_at IS NULL`;
  if (opts.status) {
    params.push(opts.status);
    sql += ` AND s.status = $${params.length}`;
  }
  sql += ` ORDER BY s.created_at DESC`;
  const { rows } = await queryWithTenant(tenantId, sql, params);
  return rows as unknown as StaffQuisionerSubmissionWithStaff[];
}

export async function getStaffSubmission(tenantId: string, id: string) {
  const { rows } = await queryWithTenant(
    tenantId,
    `SELECT s.*, u.full_name AS staff_name, u.gender AS staff_gender, u.email AS staff_email
     FROM staff_quisioner_submissions s
     JOIN users u ON u.user_id = s.staff_user_id
     WHERE s.tenant_id = $1 AND s.submission_id = $2 AND s.deleted_at IS NULL`,
    [tenantId, id],
  );
  return rows[0] ?? null;
}

export async function updateStaffSubmission(
  tenantId: string,
  id: string,
  data: { status?: string; counselor_notes?: string },
  actorId: string,
) {
  const sets: string[] = [];
  const vals: unknown[] = [tenantId, id];
  let i = 3;
  if (data.status) { sets.push(`status = $${i++}`); vals.push(data.status); }
  if (data.counselor_notes !== undefined) { sets.push(`counselor_notes = $${i++}`); vals.push(data.counselor_notes); }
  sets.push(`updated_at = now()`);
  const { rows } = await queryWithTenant(
    tenantId,
    `UPDATE staff_quisioner_submissions SET ${sets.join(', ')} WHERE tenant_id = $1 AND submission_id = $2 RETURNING *`,
    vals,
  );
  const updated = rows[0] ?? null;
  if (updated) {
    await auditLog({
      action: 'STAFF_QUISIONER_UPDATED',
      entityType: 'staff_quisioner_submissions',
      entityId: id,
      after: updated as unknown as Record<string, unknown>,
      req: undefined,
      tenantId,
      actorId,
    });
  }
  return updated;
}

export async function createMeetingFromSubmission(
  tenantId: string,
  id: string,
  data: { counselor_id: string; location?: 'online' | 'offline'; notes?: string; scheduled_at?: string },
  actorId: string,
) {
  const sub = await getStaffSubmission(tenantId, id);
  if (!sub) {
    const err: any = new Error('Submission not found');
    err.statusCode = 404;
    throw err;
  }
  const appt = await createAppointment(tenantId, {
    type: 'personal',
    created_by: actorId,
    created_for: sub.staff_user_id,
    counselor_id: data.counselor_id,
    location: data.location,
    notes: data.notes ?? `Follow-up hasil quisioner staff (skor ${sub.total_score}, rekomendasi ${sub.recommendation}).`,
  });
  await updateStaffSubmission(tenantId, id, { status: 'scheduled' }, actorId);
  if (data.scheduled_at) {
    await queryWithTenant(
      tenantId,
      `UPDATE appointments SET status = 'confirmed', scheduled_at = $1, updated_at = now() WHERE appointment_id = $2`,
      [data.scheduled_at, appt.appointment_id],
    );
  }
  // Best-effort in-app notification to the staff member
  try {
    await sendNotificationToUser(tenantId, sub.staff_user_id, {
      title: 'Undangan Janji Temu Konseling',
      body: `Halo ${sub.staff_name}, konselor telah menjadwalkan pertemuan konseling untuk membahas hasil quisioner Anda.`,
    });
  } catch {
    /* non-fatal */
  }
  return appt;
}
