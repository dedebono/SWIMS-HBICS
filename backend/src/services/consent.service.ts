import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { NotFoundError } from '../utils/errors.js';
import type { ConsentRow, CaseRow, MediaAssetRow } from '@swims/shared';
import type { Request } from 'express';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateConsentInput {
  student_id: string;
  given_by: 'PARENT' | 'GUARDIAN' | 'STUDENT';
  given_by_user_id?: string;
  consent_type: string;
  version: string;
  granted: boolean;
  expires_at?: string;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createConsent(
  tenantId: string,
  input: CreateConsentInput,
  actorId: string,
  req?: Request,
): Promise<ConsentRow> {
  const { rows } = await queryWithTenant<ConsentRow>(
    tenantId,
    `INSERT INTO consents (tenant_id, student_id, given_by, given_by_user_id, consent_type, version, granted, granted_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      tenantId,
      input.student_id,
      input.given_by,
      input.given_by_user_id ?? null,
      input.consent_type,
      input.version,
      input.granted,
      input.granted ? new Date().toISOString() : null,
      input.expires_at ?? null,
    ],
  );

  const created = rows[0]!;

  await auditLog({
    action: 'CONSENT_CREATED',
    entityType: 'consents',
    entityId: created.consent_id,
    after: created as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return created;
}

// ─── Get Status ─────────────────────────────────────────────────────────────

export async function getConsentsByStudent(
  tenantId: string,
  studentId: string,
): Promise<ConsentRow[]> {
  const { rows } = await queryWithTenant<ConsentRow>(
    tenantId,
    `SELECT * FROM consents 
     WHERE student_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [studentId, tenantId]
  );
  return rows;
}

// ─── Revoke Consent (Propagation Logic) ───────────────────────────────────────

export async function revokeConsent(
  tenantId: string,
  consentId: string,
  reason: string,
  actorId: string,
  req?: Request,
): Promise<ConsentRow> {
  const client = await getClientWithTenant(tenantId);

  try {
    await client.query('BEGIN');

    // 1. Update Consent Record
    const { rows: consentRows } = await client.query<ConsentRow>(
      `UPDATE consents 
       SET revoked_at = now(), revocation_reason = $1, granted = false
       WHERE consent_id = $2 AND tenant_id = $3 AND revoked_at IS NULL
       RETURNING *`,
      [reason, consentId, tenantId]
    );

    if (consentRows.length === 0) {
      throw new NotFoundError('Consent', consentId);
    }

    const consent = consentRows[0]!;
    const studentId = consent.student_id;

    // 2. Identify and flag media assets linked to the student via case or incident
    const { rows: assetRows } = await client.query<{ asset_id: string }>(
      `UPDATE media_assets ma
       SET retention_expiry = now() + INTERVAL '30 days'
       FROM cases c
       LEFT JOIN incidents i ON i.case_id = c.case_id
       WHERE ma.tenant_id = $1
         AND (ma.case_id = c.case_id OR ma.incident_id = i.incident_id)
         AND c.student_id = $2
         AND ma.deleted_at IS NULL
         AND ma.retention_expiry IS NULL
       RETURNING ma.asset_id`,
      [tenantId, studentId]
    );

    // 3. Flag cases for counselor review
    const { rows: caseRows } = await client.query<{ case_id: string }>(
      `UPDATE cases
       SET metadata = jsonb_set(metadata, '{consent_revoked}', 'true'::jsonb),
           status = 'MONITORING',
           updated_at = now()
       WHERE tenant_id = $1 AND student_id = $2 AND deleted_at IS NULL AND status = 'OPEN'
       RETURNING case_id`,
      [tenantId, studentId]
    );

    await client.query('COMMIT');

    // Audit logs for propagation
    await auditLog({
      action: 'CONSENT_REVOKED',
      entityType: 'consents',
      entityId: consent.consent_id,
      after: consent as unknown as Record<string, unknown>,
      req,
      tenantId,
      actorId,
    });

    if (assetRows.length > 0) {
      await auditLog({
        action: 'CONSENT_REVOKED_PROPAGATION',
        entityType: 'media_assets',
        entityId: undefined,
        after: { affected_assets: assetRows.map(r => r.asset_id) },
        req,
        tenantId,
        actorId,
      });
    }

    if (caseRows.length > 0) {
      await auditLog({
        action: 'CONSENT_REVOKED_PROPAGATION',
        entityType: 'cases',
        entityId: undefined,
        after: { flagged_cases: caseRows.map(r => r.case_id) },
        req,
        tenantId,
        actorId,
      });
    }

    return consent;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
