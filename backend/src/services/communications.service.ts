import { queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { notifyCaseWatchers } from './notifications.service.js';
import type { CaseCommunicationRow } from '@swims/shared';
import type { Request } from 'express';

export interface CreateCommunicationInput {
  message: string;
  channel?: string;
  contact_name: string;
  contact_role: string;
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
    `INSERT INTO case_communications (tenant_id, case_id, author_id, message, channel, contact_name, contact_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      caseId,
      actorId,
      input.message,
      input.channel ?? 'IN_PERSON',
      input.contact_name,
      input.contact_role,
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

  // "Chat baru / update chat" — fan-out ke semua yang mengikuti kasus
  // (pembuat kasus + semua user yang di-share). Never throws.
  await notifyCaseWatchers(tenantId, caseId, {
    type: 'CHAT_NEW',
    title: 'Pesan baru pada kasus',
    body: `${input.contact_name}: ${input.message.slice(0, 100)}`,
    link: `/dashboard/cases/${caseId}`,
  }, { excludeUserId: actorId });

  return created;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listCommunications(
  tenantId: string,
  caseId: string,
): Promise<CaseCommunicationRow[]> {
  const { rows } = await queryWithTenant<CaseCommunicationRow>(
    tenantId,
    `SELECT * FROM case_communications 
     WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     ORDER BY created_at ASC`, // Ascending format for thread view
    [caseId, tenantId]
  );

  return rows;
}
