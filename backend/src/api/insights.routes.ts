import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { generateCaseSummary, saveConfirmedSummary, startGenerationJob, getGenerationJob } from '../services/ai-insights.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const confirmSummarySchema = z.object({
  summary: z.string().min(1)
});

// ─── POST /api/cases/:caseId/insights/generate ───────────────────────────────
// Starts the generation in the background and returns immediately. Generation
// takes 80-100+s — longer than the 100s Cloudflare proxy timeout — so waiting
// synchronously here made every browser request die mid-flight. The frontend
// polls GET .../generate/status until the job reports done/error.

router.post(
  '/cases/:caseId/insights/generate',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const job = startGenerationJob(req.tenantId, req.params['caseId'] as string);
    if (job.status === 'done' && job.insight) {
      sendSuccess(res, { status: 'done', insight: job.insight });
      return;
    }
    sendSuccess(res, { status: job.status });
  })
);

// ─── GET /api/cases/:caseId/insights/generate/status ─────────────────────────

router.get(
  '/cases/:caseId/insights/generate/status',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    const job = getGenerationJob(req.tenantId, req.params['caseId'] as string);
    if (!job) {
      sendSuccess(res, { status: 'idle' });
      return;
    }
    if (job.status === 'done' && job.insight) {
      sendSuccess(res, { status: 'done', insight: job.insight });
      return;
    }
    sendSuccess(res, { status: job.status, error: job.error });
  })
);

// ─── POST /api/cases/:caseId/insights/confirm ────────────────────────────────

router.post(
  '/cases/:caseId/insights/confirm',
  checkPermission('cases', 'update'),
  asyncHandler(async (req, res) => {
    const body = confirmSummarySchema.parse(req.body);
    
    await saveConfirmedSummary(
      req.tenantId, 
      req.params['caseId'] as string, 
      body.summary, 
      req.userId
    );

    sendSuccess(res, { message: 'AI Summary confirmed and saved to case metadata.' });
  })
);

export default router;
