import { queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import type { CaseCommunicationRow } from '@swims/shared';
import type { Request } from 'express';

export interface CreateCommunicationInput {
  message: string;
  channel?: string;
  contact_name: string;
  contact_role: string;
  metadata?: Record<string, unknown>;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCommunication(
  tenantId: string,
  caseId: string,
  input: CreateCommunicationInput,
  actorId: string,
  req?: Request,
): Promise<CaseCommunicationRow> {
  const { rows } = await queryWithTenant<CaseCommunicationRow>(
    tenantId,
    `INSERT INTO case_communications (tenant_id, case_id, author_id, message, channel, contact_name, contact_role, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      tenantId,
      caseId,
      actorId,
      input.message,
      input.channel ?? 'IN_PERSON',
      input.contact_name,
      input.contact_role,
      input.metadata ? JSON.stringify(input.metadata) : '{}',
    ],
  );

  const created = rows[0]!;

  await auditLog({
    action: 'COMMUNICATION_CREATED',
    entityType: 'case_communications',
    entityId: created.comm_id,
    after: created as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return created;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listCommunications(
  tenantId: string,
  caseId: string,
): Promise<CaseCommunicationRow[]> {
  const { rows } = await queryWithTenant<CaseCommunicationRow>(
    tenantId,
    `SELECT cc.*, u.full_name as author_name
     FROM case_communications cc
     LEFT JOIN users u ON u.user_id = cc.author_id
     WHERE cc.case_id = $1 AND cc.tenant_id = $2 AND cc.deleted_at IS NULL
     ORDER BY cc.created_at DESC`,
    [caseId, tenantId]
  );

  return rows;
}
