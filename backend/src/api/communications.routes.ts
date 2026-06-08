import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as communicationsService from '../services/communications.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

const createCommunicationSchema = z.object({
  message: z.string().min(1),
  channel: z.enum(['PHONE', 'EMAIL', 'IN_PERSON', 'APP', 'INTERNAL']).optional(),
  contact_name: z.string().min(1),
  contact_role: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

// ─── POST /api/cases/:caseId/communications ────────────────────────────────

router.post(
  '/cases/:caseId/communications',
  checkPermission('cases', 'create'), // Creating a new communication record
  asyncHandler(async (req, res) => {
    const body = createCommunicationSchema.parse(req.body);
    const created = await communicationsService.createCommunication(
      req.tenantId,
      String(req.params['caseId']),
      body,
      req.userId,
      req,
    );
    sendCreated(res, created);
  }),
);

// ─── GET /api/cases/:caseId/communications ─────────────────────────────────

router.get(
  '/cases/:caseId/communications',
  checkPermission('cases', 'read'), // Using cases read since it's part of the case
  asyncHandler(async (req, res) => {
    const comms = await communicationsService.listCommunications(
      req.tenantId,
      String(req.params['caseId']),
    );
    sendSuccess(res, comms);
  }),
);

export default router;
