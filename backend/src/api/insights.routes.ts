import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { generateCaseSummary, saveConfirmedSummary } from '../services/ai-insights.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const confirmSummarySchema = z.object({
  summary: z.string().min(1)
});

// ─── POST /api/cases/:caseId/insights/generate ───────────────────────────────

router.post(
  '/cases/:caseId/insights/generate',
  checkPermission('cases', 'read'),
  asyncHandler(async (req, res) => {
    // We restrict generation to COUNSELOR, SCHOOL_HEAD, IT_ADMIN (based on role matrix typically)
    const generatedSummary = await generateCaseSummary(req.tenantId, req.params['caseId'] as string);
    sendSuccess(res, { summary: generatedSummary });
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
