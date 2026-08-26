import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as quisionerService from '../services/quisioner.service.js';
import * as quisionerSettingsService from '../services/quisioner-settings.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

// ─── QUESTIONS ───────────────────────────────────────────────────────────────

router.get(
  '/questions',
  checkPermission('quisioner', 'read'),
  asyncHandler(async (req, res) => {
    const items = await quisionerService.listQuestions(req.tenantId);
    sendSuccess(res, items);
  }),
);

router.post(
  '/questions',
  checkPermission('quisioner', 'create'),
  asyncHandler(async (req, res) => {
    const item = await quisionerService.createQuestion(req.tenantId, req.body);
    sendCreated(res, item);
  }),
);

router.patch(
  '/questions/:questionId',
  checkPermission('quisioner', 'update'),
  asyncHandler(async (req, res) => {
    const item = await quisionerService.updateQuestion(req.tenantId, req.params.questionId, req.body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.delete(
  '/questions/:questionId',
  checkPermission('quisioner', 'delete'),
  asyncHandler(async (req, res) => {
    const deleted = await quisionerService.deleteQuestion(req.tenantId, req.params.questionId);
    res.status(deleted ? 204 : 404).end();
  }),
);

// ─── ANSWERS ─────────────────────────────────────────────────────────────────

router.get(
  '/questions/:questionId/answers',
  checkPermission('quisioner', 'read'),
  asyncHandler(async (req, res) => {
    const items = await quisionerService.listAnswers(req.tenantId, req.params.questionId);
    sendSuccess(res, items);
  }),
);

router.post(
  '/questions/:questionId/answers',
  checkPermission('quisioner', 'create'),
  asyncHandler(async (req, res) => {
    const item = await quisionerService.createAnswer(req.tenantId, req.params.questionId, req.body);
    sendCreated(res, item);
  }),
);

router.patch(
  '/answers/:answerId',
  checkPermission('quisioner', 'update'),
  asyncHandler(async (req, res) => {
    const item = await quisionerService.updateAnswer(req.tenantId, String(req.params.answerId), req.body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    sendSuccess(res, item);
  }),
);

router.delete(
  '/answers/:answerId',
  checkPermission('quisioner', 'delete'),
  asyncHandler(async (req, res) => {
    const deleted = await quisionerService.deleteAnswer(req.tenantId, String(req.params.answerId));
    res.status(deleted ? 204 : 404).end();
  }),
);

// ─── THRESHOLD ───────────────────────────────────────────────────────────────

router.get(
  '/threshold',
  checkPermission('quisioner', 'read'),
  asyncHandler(async (req, res) => {
    const threshold = await quisionerSettingsService.getThreshold(req.tenantId);
    sendSuccess(res, { threshold });
  }),
);

router.patch(
  '/threshold',
  checkPermission('quisioner', 'update'),
  asyncHandler(async (req, res) => {
    const { threshold } = req.body as { threshold: number };
    await quisionerSettingsService.setThreshold(req.tenantId, threshold);
    sendSuccess(res, { threshold });
  }),
);

// ─── QUIZ SUBMISSION ─────────────────────────────────────────────────────────

router.post(
  '/submit',
  checkPermission('quisioner', 'create'),
  asyncHandler(async (req, res) => {
    const { answers, threshold } = req.body as { answers: Array<{ score: number }>; threshold?: number };
    const score = await quisionerService.calculateScore(answers);
    const effectiveThreshold = threshold ?? await quisionerSettingsService.getThreshold(req.tenantId);
    const recommendation = await quisionerService.getRecommendation(score, effectiveThreshold);
    sendSuccess(res, { score, recommendation, threshold: effectiveThreshold });
  }),
);

export default router;
