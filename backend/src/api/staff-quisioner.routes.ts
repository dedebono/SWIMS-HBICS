import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext, setTenantFromSlug } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { pool } from '../db/pool.js';
import * as quisionerService from '../services/quisioner.service.js';
import * as staffService from '../services/staff-quisioner.service.js';
import * as settingsService from '../services/quisioner-settings.service.js';
import * as quisionerListsService from '../services/quisioner-lists.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

// ── PUBLIC (anonymous, identified by NIK + tenant slug in ?t=) ───────────────
router.get('/quisioner/staff/config', setTenantFromSlug, asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.getSettings((req as any).tenantId));
}));

router.post('/quisioner/staff/verify-nik', setTenantFromSlug, asyncHandler(async (req, res) => {
  const { nik } = req.body as { nik: string };
  sendSuccess(res, await staffService.verifyNik((req as any).tenantId, nik));
}));

router.get('/quisioner/staff/questions', setTenantFromSlug, asyncHandler(async (req, res) => {
  const tenantId = (req as any).tenantId;
  const list = await quisionerListsService.getActiveListForTargets(tenantId, ['staff']);
  if (list) {
    sendSuccess(res, await quisionerService.listQuestions(tenantId, list.question_list_id));
    return;
  }
  sendSuccess(res, await quisionerService.listQuestions(tenantId));
}));

router.get('/quisioner/staff/questions/:qid/answers', setTenantFromSlug, asyncHandler(async (req, res) => {
  sendSuccess(res, await quisionerService.listAnswers((req as any).tenantId, req.params.qid));
}));

router.post('/quisioner/staff/submit', setTenantFromSlug, asyncHandler(async (req, res) => {
  const { nik, answers } = req.body as { nik: string; answers: any[] };
  const tenantId = (req as any).tenantId;
  try {
    const list = await quisionerListsService.getActiveListForTargets(tenantId, ['staff']);
    const result = await staffService.submitStaffQuisioner(tenantId, {
      nik,
      answers,
      question_list_id: list?.question_list_id ?? null,
    });
    sendCreated(res, result);
  } catch (e: any) {
    if (e.statusCode === 422) return res.status(422).json({ message: e.message });
    throw e;
  }
}));

// ── PROTECTED (authenticated) ────────────────────────────────────────────────
router.get('/quisioner/tenant-slug', authenticate, setTenantContext, asyncHandler(async (req, res) => {
  const { rows } = await pool.query<{ slug: string }>(
    'SELECT slug FROM tenants WHERE tenant_id = $1',
    [req.tenantId!],
  );
  sendSuccess(res, { slug: rows[0]?.slug });
}));

router.get('/quisioner/settings', authenticate, setTenantContext, checkPermission('quisioner', 'read'), asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.getSettings(req.tenantId!));
}));

router.patch('/quisioner/settings', authenticate, setTenantContext, checkPermission('quisioner', 'update'), asyncHandler(async (req, res) => {
  const { threshold, target } = req.body as { threshold?: number; target?: 'student' | 'staff' };
  await settingsService.setSettings(req.tenantId!, { threshold, target });
  sendSuccess(res, await settingsService.getSettings(req.tenantId!));
}));

router.get('/counselor/staff-submissions', authenticate, setTenantContext, checkPermission('staff_quisioner', 'read'), asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  sendSuccess(res, await staffService.listStaffSubmissions(req.tenantId!, { status }));
}));

router.get('/counselor/staff-submissions/:id', authenticate, setTenantContext, checkPermission('staff_quisioner', 'read'), asyncHandler(async (req, res) => {
  const sub = await staffService.getStaffSubmission(req.tenantId!, req.params.id);
  if (!sub) return res.status(404).json({ message: 'Not found' });
  sendSuccess(res, sub);
}));

router.patch('/counselor/staff-submissions/:id', authenticate, setTenantContext, checkPermission('staff_quisioner', 'update'), asyncHandler(async (req, res) => {
  const updated = await staffService.updateStaffSubmission(req.tenantId!, req.params.id, req.body, req.userId!);
  if (!updated) return res.status(404).json({ message: 'Not found' });
  sendSuccess(res, updated);
}));

router.post('/counselor/staff-submissions/:id/meeting', authenticate, setTenantContext, checkPermission('staff_quisioner', 'update'), asyncHandler(async (req, res) => {
  const { counselor_id, location, notes, scheduled_at } = req.body as any;
  try {
    const appt = await staffService.createMeetingFromSubmission(
      req.tenantId!,
      req.params.id,
      { counselor_id, location, notes, scheduled_at },
      req.userId!,
    );
    sendCreated(res, appt);
  } catch (e: any) {
    if (e.statusCode === 404) return res.status(404).json({ message: e.message });
    throw e;
  }
}));

export default router;
