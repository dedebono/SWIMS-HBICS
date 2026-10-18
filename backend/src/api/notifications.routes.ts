import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import * as notificationsService from '../services/notifications.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, setTenantContext);

/**
 * Notifikasi bersifat personal: SETIAP baris dibaca/ditulis dengan filter
 * `user_id = req.userId`, jadi tidak lewat checkPermission (matrix permission
 * tidak punya resource 'notifications' untuk semua role — menambahkannya
 * justru bikin role lain 403). Tenant isolation tetap dijaga RLS via
 * setTenantContext + queryWithTenant.
 *
 * GET    /                     → inbox aktif (belum ditutup)
 * GET    /dismissed            → notifikasi yang ditutup (masih bisa dibuka)
 * GET    /unread-count         → { count } untuk badge bel
 * PATCH  /:id/read             → tandai dibaca / belum dibaca
 * POST   /read-all             → tandai semua dibaca
 * PATCH  /:id/dismiss          → tutup (X) — hilang dari inbox, masih restorable
 * PATCH  /:id/undismiss        → buka lagi dari bagian "Ditutup"
 * DELETE /:id                  → hapus permanen
 * DELETE /dismissed            → bersihkan semua yang sudah ditutup
 */

// ─── Static paths BEFORE /:id ────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await notificationsService.listNotifications(req.tenantId, req.userId!, {
      dismissed: false,
      limit: Number(req.query['limit'] ?? 50),
    });
    sendSuccess(res, items);
  }),
);

router.get(
  '/dismissed',
  asyncHandler(async (req, res) => {
    const items = await notificationsService.listNotifications(req.tenantId, req.userId!, {
      dismissed: true,
      limit: Number(req.query['limit'] ?? 50),
    });
    sendSuccess(res, items);
  }),
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const count = await notificationsService.countUnread(req.tenantId, req.userId!);
    sendSuccess(res, { count });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const updated = await notificationsService.markAllNotificationsRead(req.tenantId, req.userId!);
    sendSuccess(res, { updated });
  }),
);

router.delete(
  '/dismissed',
  asyncHandler(async (req, res) => {
    const deleted = await notificationsService.clearDismissedNotifications(req.tenantId, req.userId!);
    sendSuccess(res, { deleted });
  }),
);

// ─── Per-notification ────────────────────────────────────────────────────────

router.patch(
  '/:notificationId/read',
  asyncHandler(async (req, res) => {
    const isRead = req.body?.is_read !== false;
    const item = await notificationsService.markNotificationRead(
      req.tenantId,
      req.userId!,
      String(req.params['notificationId']),
      isRead,
    );
    if (!item) return res.status(404).json({ success: false, data: null, error: 'Notifikasi tidak ditemukan' });
    sendSuccess(res, item);
  }),
);

router.patch(
  '/:notificationId/dismiss',
  asyncHandler(async (req, res) => {
    const item = await notificationsService.dismissNotification(
      req.tenantId,
      req.userId!,
      String(req.params['notificationId']),
      true,
    );
    if (!item) return res.status(404).json({ success: false, data: null, error: 'Notifikasi tidak ditemukan' });
    sendSuccess(res, item);
  }),
);

router.patch(
  '/:notificationId/undismiss',
  asyncHandler(async (req, res) => {
    const item = await notificationsService.dismissNotification(
      req.tenantId,
      req.userId!,
      String(req.params['notificationId']),
      false,
    );
    if (!item) return res.status(404).json({ success: false, data: null, error: 'Notifikasi tidak ditemukan' });
    sendSuccess(res, item);
  }),
);

router.delete(
  '/:notificationId',
  asyncHandler(async (req, res) => {
    const deleted = await notificationsService.deleteNotification(
      req.tenantId,
      req.userId!,
      String(req.params['notificationId']),
    );
    if (!deleted) return res.status(404).json({ success: false, data: null, error: 'Notifikasi tidak ditemukan' });
    sendSuccess(res, { deleted: true });
  }),
);

export default router;
