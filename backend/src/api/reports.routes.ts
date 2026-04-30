import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import { generateStudentReport, getReportUrl } from '../services/reports.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const generateReportSchema = z.object({
  student_id: z.string().uuid()
});

// ─── POST /api/reports/generate ─────────────────────────────────────────────

router.post(
  '/generate',
  checkPermission('reports', 'create'),
  asyncHandler(async (req, res) => {
    const body = generateReportSchema.parse(req.body);

    const reportId = await generateStudentReport(
      req.tenantId,
      body.student_id,
      req.userId
    );

    sendSuccess(res, { reportId, message: 'Report generated successfully' });
  }),
);

// ─── GET /api/reports/:reportId ──────────────────────────────────────────────

router.get(
  '/:reportId',
  checkPermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const reportUrl = await getReportUrl(
      req.tenantId,
      req.params['reportId'] as string
    );

    sendSuccess(res, { downloadUrl: reportUrl });
  }),
);

export default router;
