import { queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import type { PositiveObservationRow } from '@swims/shared';
import type { Request } from 'express';

export interface CreateObservationInput {
  student_id: string;
  case_id?: string;
  category: string; // e.g. "LEADERSHIP", "IMPROVED_ATTENDANCE", "PEER_SUPPORT"
  description: string;
  observed_at: string;
}

export async function createObservation(
  tenantId: string,
  input: CreateObservationInput,
  actorId: string,
  req?: Request,
): Promise<PositiveObservationRow> {
  const { rows } = await queryWithTenant<PositiveObservationRow>(
    tenantId,
    `INSERT INTO positive_observations (tenant_id, student_id, case_id, recorded_by, category, description, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      input.student_id,
      input.case_id ?? null,
      actorId,
      input.category,
      input.description,
      input.observed_at,
    ],
  );

  const created = rows[0]!;

  await auditLog({
    action: 'OBSERVATION_CREATED',
    entityType: 'positive_observations',
    entityId: created.observation_id,
    after: created as unknown as Record<string, unknown>,
    req,
    tenantId,
    actorId,
  });

  return created;
}

export async function listObservationsByStudent(
  tenantId: string,
  studentId: string,
): Promise<PositiveObservationRow[]> {
  const { rows } = await queryWithTenant<PositiveObservationRow>(
    tenantId,
    `SELECT * FROM positive_observations 
     WHERE student_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     ORDER BY observed_at DESC`,
    [studentId, tenantId]
  );
  return rows;
}
