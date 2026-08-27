import { queryWithTenant } from '../db/pool.js';
import { updateAppointmentStatus } from './appointments.service.js';

export type ReferralType = 'internal_psychologist' | 'puspaga_external';
export type ReferralStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface ReferralRow {
  referral_id: string;
  tenant_id: string;
  appointment_id: string | null;
  recommended_by: string | null;
  reason: string;
  referral_type: ReferralType;
  status: ReferralStatus;
  leader_id: string | null;
  leader_decision_at: Date | null;
  leader_note: string | null;
  external_result_note: string | null;
  external_recorded_by: string | null;
  external_recorded_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ReferralView extends ReferralRow {
  recommended_by_name: string | null;
  appointment_type: string | null;
  appointment_status: string | null;
  scheduled_at: Date | null;
  created_for: string | null;
}

export async function createReferral(
  tenantId: string,
  data: { appointment_id: string; recommended_by: string; reason: string; referral_type: ReferralType },
): Promise<ReferralRow> {
  const { rows } = await queryWithTenant<ReferralRow>(
    tenantId,
    `INSERT INTO psychologist_referrals (tenant_id, appointment_id, recommended_by, reason, referral_type, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [tenantId, data.appointment_id, data.recommended_by, data.reason, data.referral_type],
  );
  return rows[0]!;
}

export async function listReferrals(
  tenantId: string,
  opts: { role: string; userId: string; status?: ReferralStatus },
): Promise<ReferralView[]> {
  const params: unknown[] = [tenantId];
  let filter = '';
  if (opts.role === 'SCHOOL_HEAD') {
    filter = `AND r.status = 'pending'`;
  } else {
    filter = `AND r.recommended_by = $2`;
    params.push(opts.userId);
  }
  const { rows } = await queryWithTenant<ReferralView>(
    tenantId,
    `SELECT r.*,
            u.full_name AS recommended_by_name,
            a.type AS appointment_type,
            a.status AS appointment_status,
            a.scheduled_at,
            a.created_for
     FROM psychologist_referrals r
     JOIN users u ON u.user_id = r.recommended_by AND u.tenant_id = $1
     LEFT JOIN appointments a ON a.appointment_id = r.appointment_id AND a.tenant_id = $1
     WHERE r.tenant_id = $1 AND r.deleted_at IS NULL ${filter}
     ORDER BY r.created_at DESC`,
    params,
  );
  return rows;
}

export async function approveReferral(
  tenantId: string,
  referralId: string,
  leaderId: string,
  approve: boolean,
  note?: string,
): Promise<ReferralRow> {
  const { rows: existing } = await queryWithTenant<ReferralRow>(
    tenantId,
    `SELECT * FROM psychologist_referrals WHERE tenant_id = $1 AND referral_id = $2 AND deleted_at IS NULL`,
    [tenantId, referralId],
  );
  if (!existing[0]) {
    const e: any = new Error('Rujukan tidak ditemukan.');
    e.statusCode = 404;
    throw e;
  }
  const ref = existing[0]!;
  if (ref.status !== 'pending') {
    const e: any = new Error('Rujukan sudah diproses.');
    e.statusCode = 409;
    throw e;
  }
  const newStatus: ReferralStatus = approve ? 'approved' : 'rejected';
  const { rows } = await queryWithTenant<ReferralRow>(
    tenantId,
    `UPDATE psychologist_referrals
     SET status = $3, leader_id = $4, leader_decision_at = now(), leader_note = $5, updated_at = now()
     WHERE tenant_id = $1 AND referral_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [tenantId, referralId, newStatus, leaderId, note ?? null],
  );

  // On approval of an internal psychologist referral, surface the appointment to the psychologist.
  if (approve && ref.referral_type === 'internal_psychologist' && ref.appointment_id) {
    try {
      await updateAppointmentStatus(tenantId, ref.appointment_id, 'awaiting_psychologist_availability', leaderId, note);
    } catch {
      /* non-fatal: appointment may already be in a terminal state */
    }
  }
  return rows[0]!;
}

export async function recordExternalResult(
  tenantId: string,
  referralId: string,
  recordedBy: string,
  note: string,
): Promise<ReferralRow> {
  const { rows: existing } = await queryWithTenant<ReferralRow>(
    tenantId,
    `SELECT * FROM psychologist_referrals WHERE tenant_id = $1 AND referral_id = $2 AND deleted_at IS NULL`,
    [tenantId, referralId],
  );
  if (!existing[0]) {
    const e: any = new Error('Rujukan tidak ditemukan.');
    e.statusCode = 404;
    throw e;
  }
  if (existing[0]!.status !== 'approved') {
    const e: any = new Error('Rujukan harus disetujui terlebih dahulu.');
    e.statusCode = 409;
    throw e;
  }
  const { rows } = await queryWithTenant<ReferralRow>(
    tenantId,
    `UPDATE psychologist_referrals
     SET external_result_note = $3, external_recorded_by = $4, external_recorded_at = now(), status = 'completed', updated_at = now()
     WHERE tenant_id = $1 AND referral_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [tenantId, referralId, note, recordedBy],
  );
  return rows[0]!;
}
