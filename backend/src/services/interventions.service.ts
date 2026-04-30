import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { NotFoundError } from '../utils/errors.js';
import type { InterventionRow } from '@swims/shared';
import type { Request } from 'express';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateInterventionInput {
  incident_id?: string;
  assigned_staff?: string[];
  type: string;
  description: string;
  scheduled_at?: string;
}

export interface UpdateInterventionInput {
  assigned_staff?: string[];
  type?: string;
  description?: string;
  scheduled_at?: string;
  completed_at?: string;
  outcome?: string;
  effectiveness?: number;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createIntervention(
  tenantId: string,
  caseId: string,
  input: CreateInterventionInput,
  actorId: string,
  req?: Request,
): Promise<InterventionRow> {
  const { rows } = await queryWithTenant<InterventionRow>(
    tenantId,
    `INSERT INTO interventions (tenant_id, case_id, incident_id, assigned_staff, type, description, scheduled_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      tenantId,
      caseId,
      input.incident_id ?? null,
      JSON.stringify(input.assigned_staff ?? []),
      input.type,
      input.description,
      input.scheduled_at ?? null,
      actorId,
    ],
  );

  const created = rows[0]!;

  await auditLog({
    action: 'INTERVENTION_CREATED',
    entityType: 'interventions',
    entityId: created.intervention_id,
    after: created as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return created;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listInterventions(
  tenantId: string,
  caseId: string,
): Promise<InterventionRow[]> {
  const { rows } = await queryWithTenant<InterventionRow>(
    tenantId,
    `SELECT * FROM interventions 
     WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     ORDER BY COALESCE(scheduled_at, created_at) DESC`,
    [caseId, tenantId]
  );

  return rows;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateIntervention(
  tenantId: string,
  interventionId: string,
  input: UpdateInterventionInput,
  actorId: string,
  req?: Request,
): Promise<InterventionRow> {
  // Fetch existing intervention to ensure it belongs to this tenant
  const { rows: existingRows } = await queryWithTenant<InterventionRow>(
    tenantId,
    `SELECT * FROM interventions WHERE intervention_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [interventionId, tenantId],
  );

  if (existingRows.length === 0) {
    throw new NotFoundError('Intervention', interventionId);
  }
  const before = existingRows[0]!;

  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [interventionId, tenantId];
  let paramIdx = 3;

  if (input.assigned_staff !== undefined) {
    setClauses.push(`assigned_staff = $${paramIdx++}`);
    values.push(JSON.stringify(input.assigned_staff));
  }
  if (input.type !== undefined) {
    setClauses.push(`type = $${paramIdx++}`);
    values.push(input.type);
  }
  if (input.description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`);
    values.push(input.description);
  }
  if (input.scheduled_at !== undefined) {
    setClauses.push(`scheduled_at = $${paramIdx++}`);
    values.push(input.scheduled_at);
  }
  if (input.completed_at !== undefined) {
    setClauses.push(`completed_at = $${paramIdx++}`);
    values.push(input.completed_at);
  }
  if (input.outcome !== undefined) {
    setClauses.push(`outcome = $${paramIdx++}`);
    values.push(input.outcome);
  }
  if (input.effectiveness !== undefined) {
    setClauses.push(`effectiveness = $${paramIdx++}`);
    values.push(input.effectiveness);
  }

  const { rows } = await queryWithTenant<InterventionRow>(
    tenantId,
    `UPDATE interventions SET ${setClauses.join(', ')}
     WHERE intervention_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  const updated = rows[0]!;

  await auditLog({
    action: 'INTERVENTION_UPDATED',
    entityType: 'interventions',
    entityId: interventionId,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return updated;
}
