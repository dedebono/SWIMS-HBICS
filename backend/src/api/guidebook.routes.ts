import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import * as guidebookService from '../services/guidebook.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

/**
 * GET /api/guidebook
 * Returns all guidebooks structured by school level and violation categories.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const guidebooks = guidebookService.loadAllGuidebooks();

    const structured = guidebooks.map(gb => ({
      filename: gb.filename,
      schoolLevel: gb.schoolLevel,
      categories: guidebookService.extractViolationCategories(gb)
    }));

    sendSuccess(res, structured);
  }),
);

export default router;
