import { Router } from 'express';
import { asyncHandler } from '../../middleware/error-handler.middleware.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { setTenantContext } from '../../middleware/tenant.middleware.js';
import { queryWithTenant } from '../../db/pool.js';
import type { SchoolPsychologistRow } from '@swims/shared';
import { sendSuccess, sendCreated, sendError } from '../../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

// GET /api/admin/psychologists
router.get('/', requireRole('IT_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const { rows } = await queryWithTenant<SchoolPsychologistRow>(
    (req as any).tenantId,
    `SELECT * FROM school_psychologists WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY full_name ASC`,
    [(req as any).tenantId],
  );
  sendSuccess(res, rows);
}));

// POST /api/admin/psychologists
router.post('/', requireRole('IT_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const { full_name, expertise, consultation_fee, photo_url } = req.body as any;
  if (!full_name || !expertise || consultation_fee == null) {
    return sendError(res, 'full_name, expertise, consultation_fee wajib diisi', 400);
  }
  const { rows } = await queryWithTenant<SchoolPsychologistRow>(
    (req as any).tenantId,
    `INSERT INTO school_psychologists (tenant_id, full_name, expertise, consultation_fee, photo_url, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [(req as any).tenantId, full_name, expertise, consultation_fee, photo_url ?? null],
  );
  sendCreated(res, rows[0]);
}));

// PUT /api/admin/psychologists?id=
router.put('/', requireRole('IT_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const id = req.query.id as string;
  if (!id) return sendError(res, 'id wajib', 400);
  const { full_name, expertise, consultation_fee, photo_url, is_active } = req.body as any;
  const { rows } = await queryWithTenant<SchoolPsychologistRow>(
    (req as any).tenantId,
    `UPDATE school_psychologists
     SET full_name = COALESCE($3, full_name),
         expertise = COALESCE($4, expertise),
         consultation_fee = COALESCE($5, consultation_fee),
         photo_url = $6,
         is_active = COALESCE($7, is_active),
         updated_at = now()
     WHERE psychologist_id = $2 AND tenant_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [(req as any).tenantId, id, full_name, expertise, consultation_fee, photo_url ?? null, is_active],
  );
  if (!rows[0]) return sendError(res, 'Psikolog tidak ditemukan', 404);
  sendSuccess(res, rows[0]);
}));

// DELETE /api/admin/psychologists?id=
router.delete('/', requireRole('IT_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const id = req.query.id as string;
  if (!id) return sendError(res, 'id wajib', 400);
  await queryWithTenant(
    (req as any).tenantId,
    `UPDATE school_psychologists SET deleted_at = now() WHERE psychologist_id = $2 AND tenant_id = $1 AND deleted_at IS NULL`,
    [(req as any).tenantId, id],
  );
  sendSuccess(res, { message: 'Psikolog berhasil dihapus' });
}));

export default router;
