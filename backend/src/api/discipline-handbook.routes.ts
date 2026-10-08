import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { sendSuccess } from '../utils/response.js';
import * as service from '../services/discipline-handbook.service.js';
import type { Request } from 'express';

const router = Router();

router.use(authenticate, setTenantContext);

// ─── GET /api/discipline-handbook/tree ──────────────────────────────────────
// Full hierarchical handbook (for frontend display)

router.get('/tree',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const levelId = req.query.level_id ? Number(req.query.level_id) : undefined;
    const tree = await service.getFullHandbook(tenantId, levelId);
    sendSuccess(res, tree);
  })
);

// ─── Search ──────────────────────────────────────────────────────────────────

router.get('/search',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const results = await service.searchBehaviors(tenantId, {
      q: req.query.q as string,
      category_id: req.query.category_id ? Number(req.query.category_id) : undefined,
      level_id: req.query.level_id ? Number(req.query.level_id) : undefined,
      group_id: req.query.group_id ? Number(req.query.group_id) : undefined,
    });
    sendSuccess(res, results);
  })
);

// ─── Categories ───────────────────────────────────────────────────────────────

router.get('/categories',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.listCategories(tenantId));
  })
);

router.post('/categories',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.createCategory(tenantId, req.body), 201);
  })
);

router.put('/categories/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const id = Number(req.params.id);
    sendSuccess(res, await service.updateCategory(tenantId, id, req.body));
  })
);

router.delete('/categories/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    await service.deleteCategory(tenantId, Number(req.params.id));
    sendSuccess(res, { deleted: true });
  })
);

// ─── Education Levels ────────────────────────────────────────────────────────

router.get('/levels',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.listEducationLevels(tenantId));
  })
);

router.post('/levels',
  requireRole('IT_ADMIN'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.createEducationLevel(tenantId, req.body), 201);
  })
);

router.put('/levels/:id',
  requireRole('IT_ADMIN'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.updateEducationLevel(tenantId, Number(req.params.id), req.body));
  })
);

router.delete('/levels/:id',
  requireRole('IT_ADMIN'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    await service.deleteEducationLevel(tenantId, Number(req.params.id));
    sendSuccess(res, { deleted: true });
  })
);

// ─── Behavior Groups ──────────────────────────────────────────────────────────

router.get('/groups',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;
    sendSuccess(res, await service.listBehaviorGroups(tenantId, categoryId));
  })
);

router.post('/groups',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.createBehaviorGroup(tenantId, req.body), 201);
  })
);

router.delete('/groups/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    await service.deleteBehaviorGroup(tenantId, Number(req.params.id));
    sendSuccess(res, { deleted: true });
  })
);

// ─── Behavior Details ────────────────────────────────────────────────────────

router.get('/behaviors',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const groupId = req.query.group_id ? Number(req.query.group_id) : undefined;
    sendSuccess(res, await service.listBehaviorDetails(tenantId, groupId));
  })
);

router.post('/behaviors',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const { level_ids, ...behaviorData } = req.body as { level_ids?: number[]; group_id: number; behavior_text: string };
    const created = await service.createBehaviorDetail(tenantId, behaviorData);
    if (level_ids && level_ids.length > 0) {
      await service.setBehaviorLevels(tenantId, created.id, level_ids);
    }
    sendSuccess(res, created, 201);
  })
);

router.put('/behaviors/:id/levels',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const behaviorId = Number(req.params.id);
    const { level_ids } = req.body as { level_ids: number[] };
    await service.setBehaviorLevels(tenantId, behaviorId, level_ids);
    sendSuccess(res, { levels: await service.getBehaviorLevels(tenantId, behaviorId) });
  })
);

router.delete('/behaviors/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    await service.deleteBehaviorDetail(tenantId, Number(req.params.id));
    sendSuccess(res, { deleted: true });
  })
);

// ─── Handling Guidelines ─────────────────────────────────────────────────────

router.get('/guidelines',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;
    const levelId = req.query.level_id ? Number(req.query.level_id) : undefined;
    sendSuccess(res, await service.listHandlingGuidelines(tenantId, categoryId, levelId));
  })
);

router.post('/guidelines',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.createHandlingGuideline(tenantId, req.body), 201);
  })
);

router.put('/guidelines/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.updateHandlingGuideline(tenantId, Number(req.params.id), req.body));
  })
);

router.delete('/guidelines/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    await service.deleteHandlingGuideline(tenantId, Number(req.params.id));
    sendSuccess(res, { deleted: true });
  })
);

// ─── Consequence Guidelines ───────────────────────────────────────────────────

router.get('/consequences',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;
    const levelId = req.query.level_id ? Number(req.query.level_id) : undefined;
    sendSuccess(res, await service.listConsequenceGuidelines(tenantId, categoryId, levelId));
  })
);

router.post('/consequences',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.createConsequenceGuideline(tenantId, req.body), 201);
  })
);

router.put('/consequences/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.updateConsequenceGuideline(tenantId, Number(req.params.id), req.body));
  })
);

router.delete('/consequences/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    await service.deleteConsequenceGuideline(tenantId, Number(req.params.id));
    sendSuccess(res, { deleted: true });
  })
);

// ─── Required Documents ───────────────────────────────────────────────────────

router.get('/documents',
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;
    const levelId = req.query.level_id ? Number(req.query.level_id) : undefined;
    sendSuccess(res, await service.listRequiredDocuments(tenantId, categoryId, levelId));
  })
);

router.post('/documents',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.createRequiredDocument(tenantId, req.body), 201);
  })
);

router.put('/documents/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    sendSuccess(res, await service.updateRequiredDocument(tenantId, Number(req.params.id), req.body));
  })
);

router.delete('/documents/:id',
  requireRole('IT_ADMIN', 'COUNSELOR'),
  asyncHandler(async (req: Request, res) => {
    const tenantId = (req as any).tenantId;
    await service.deleteRequiredDocument(tenantId, Number(req.params.id));
    sendSuccess(res, { deleted: true });
  })
);

// ─── EXPORT / IMPORT ──────────────────────────────────────────────────────
// GET /api/discipline-handbook/export - Export all handbook data as JSON
router.get('/export', asyncHandler(async (req: Request, res) => {
  const { tenantId } = req as any;
  const data = await service.exportHandbookData(tenantId);
  sendSuccess(res, data);
}));

// POST /api/discipline-handbook/import - Import handbook data from JSON
router.post('/import', asyncHandler(async (req: Request, res) => {
  const { tenantId } = req as any;
  const result = await service.importHandbookData(tenantId, req.body);
  sendSuccess(res, result);
}));

export default router;