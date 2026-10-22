import { pool, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { getGowaSettings } from './tenant-settings.service.js';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Normalise a stored phone number into the international form GOWA accepts.
 *
 * GOWA rejects anything starting with `0` (Indonesian local format like
 * `0812…`) with "phone number must be in international format", and it only
 * tolerates a leading `+`. SWIMS stores whatever an IT admin typed into the
 * student/parent phone field, so the value reaching this function can be
 * `0812…`, `+62812…`, `62812…`, or a JID like `62812…@s.whatsapp.net`.
 *
 * Returns `null` when the input cannot be turned into a usable number, so the
 * caller can fail loudly instead of silently sending to a malformed recipient.
 */
export function normalizeGowaPhone(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  // Already a full JID (…@s.whatsapp.net, …@g.us, …@lid): GOWA handles those
  // as-is, so leave them untouched.
  if (trimmed.includes('@')) return trimmed;

  // Strip formatting characters, then the optional leading '+'.
  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!digits) return null;

  // Local Indonesian format → international. GOWA explicitly rejects a leading 0.
  if (digits.startsWith('0')) {
    digits = `62${digits.slice(1)}`;
  }

  // A usable WhatsApp number is 8–15 digits (E.164 max 15).
  if (!/^\d{8,15}$/.test(digits)) return null;

  return digits;
}

/**
 * Sends a WhatsApp message via GOWA (WhatsApp HTTP API).
 *
 * Transport migrated from WAHA to GOWA. The exported name and the
 * `{ chatId, text }` payload are kept so every existing caller
 * (appointments.service.ts, psychologist-referral.service.ts) works unchanged.
 *
 * Differences from the old WAHA transport:
 *  - endpoint: `POST {base}/send/message` (was `POST {base}/api/sendText`)
 *  - payload: `{ phone, message }`  (was `{ session, chatId, text }`)
 *  - auth: HTTP Basic `Authorization: Basic base64(user:password)`
 *    (was the `x-api-key` header)
 *  - response: `{ code: 'SUCCESS', results: { message_id, status } }`
 *    (was `{ id }`)
 *
 * URL / basic-auth come from the tenant's saved Pengaturan Sistem (falling back
 * to env, then to the GOWA server default). This used to read `env.WAHA_URL`
 * and hardcode `session: 'default'`, so everything an IT admin typed into the
 * WhatsApp panel was ignored.
 */
export async function sendWhatsAppMessage(
  tenantId: string,
  payload: { chatId: string; text: string },
): Promise<{ success: boolean; messageId?: string }> {
  const { enabled, url: apiUrl, basicAuth, deviceId } = await getGowaSettings(tenantId);

  if (!enabled) {
    console.log('[GOWA] Disabled by configuration — message not sent.');
    return { success: false };
  }

  const phone = normalizeGowaPhone(payload.chatId);
  if (!phone) {
    console.error(`[GOWA] Invalid recipient number: ${String(payload.chatId).slice(0, 6)}…`);
    return { success: false };
  }

  const baseUrl = apiUrl.replace(/\/+$/, '');

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (basicAuth) {
      headers.Authorization = `Basic ${Buffer.from(basicAuth).toString('base64')}`;
    }
    if (deviceId) {
      headers['X-Device-Id'] = deviceId;
    }

    const res = await fetch(`${baseUrl}/send/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone,
        message: payload.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const raw = await res.text();
    let data: {
      code?: string;
      message?: string;
      results?: { message_id?: string; status?: string };
    };
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    if (!res.ok) {
      console.error(
        `[GOWA] Failed to send message: ${res.status} ${res.statusText} — ${data.message ?? raw.slice(0, 200)}`,
      );
      return { success: false };
    }

    // GOWA answers 200 with code=SUCCESS on success and code=VALIDATION_ERROR
    // (still 200) on a rejected payload, so the HTTP status alone is not enough.
    if (data.code !== 'SUCCESS') {
      console.error(`[GOWA] Send rejected: ${data.code ?? 'UNKNOWN'} — ${data.message ?? raw.slice(0, 200)}`);
      return { success: false };
    }

    return { success: true, messageId: data.results?.message_id };
  } catch (err) {
    console.error('[GOWA] Error sending WhatsApp message:', err);
    return { success: false };
  }
}

/**
 * Mocks the Firebase Cloud Messaging Admin SDK.
 * In production, you would configure 'firebase-admin' globally
 * and send messages utilizing users' registered device tokens.
 */
export async function sendNotificationToUser(
  tenantId: string,
  userId: string,
  payload: PushNotificationPayload,
): Promise<void> {
  console.log(`[FCM MOCK] Sending push notification to User ${userId}`);
  console.log(`[FCM MOCK] Title: ${payload.title}`);
  console.log(`[FCM MOCK] Body: ${payload.body}`);

  // We could log this to the audit_log just to prove it fired for MVP
  await auditLog({
    action: 'NOTIFICATION_SENT',
    entityType: 'users',
    entityId: userId,
    after: {
      notification_payload: payload,
      delivery_system: 'FCM_MOCK'
    },
    req: undefined,
    tenantId,
    actorId: 'SYSTEM',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// In-app notifications (bel notifikasi)
// ════════════════════════════════════════════════════════════════════════════
//
// Satu tabel `notifications`, satu baris per penerima. Semua fungsi tulis di
// bawah sengaja TIDAK PERNAH melempar error: notifikasi adalah efek samping
// dari alur bisnis (buat kasus, share kasus, booking konseling, …) dan tidak
// boleh membuat alur utamanya gagal. Kegagalan dicatat ke console dan
// ditelan. Fungsi baca/tandai (dipakai routes) tetap membiarkan error naik
// supaya API bisa menjawab 4xx/5xx dengan jujur.

export type NotificationType =
  | 'CASE_NEW'
  | 'CASE_SHARED'
  | 'CASE_PROGRESS'
  | 'CHAT_NEW'
  | 'COUNSELING_REQUEST'
  | 'SCHEDULE_NEW'
  | 'SCHEDULE_UPDATE'
  | 'APPOINTMENT_REQUEST'
  | 'SYSTEM_ERROR';

export interface InAppNotificationRow {
  notification_id: string;
  tenant_id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  read_at: Date | null;
  dismissed_at: Date | null;
  created_at: Date;
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body?: string;
  /** Path frontend tujuan saat notifikasi diklik. */
  link?: string;
}

/** Roles that map to the "Teacher" audience in the notification spec. */
export const TEACHER_ROLES = ['TEACHER', 'SUBSTITUTE_TEACHER'] as const;
/** Role that maps to "admin". */
export const ADMIN_ROLES = ['IT_ADMIN'] as const;

function logNotifyFailure(scope: string, err: unknown): void {
  console.error(`[notify:${scope}] failed (non-fatal):`, err);
}

/**
 * Insert one notification row for one recipient. Never throws.
 * Returns the created row, or null when skipped / failed.
 */
export async function createNotification(
  tenantId: string,
  input: { user_id: string } & NotificationPayload,
): Promise<InAppNotificationRow | null> {
  try {
    if (!input.user_id) return null;
    const { rows } = await queryWithTenant<InAppNotificationRow>(
      tenantId,
      `INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, input.user_id, input.type, input.title, input.body ?? null, input.link ?? null],
    );
    return rows[0] ?? null;
  } catch (err) {
    logNotifyFailure('createNotification', err);
    return null;
  }
}

/**
 * Fan out one payload to several users. Skips `excludeUserId` (the actor
 * should not be notified about their own action). Never throws.
 */
export async function notifyUsers(
  tenantId: string,
  userIds: Array<string | null | undefined>,
  payload: NotificationPayload,
  opts?: { excludeUserId?: string },
): Promise<void> {
  try {
    const unique = [
      ...new Set(
        userIds.filter((id): id is string => Boolean(id) && id !== opts?.excludeUserId),
      ),
    ];
    await Promise.all(unique.map((user_id) => createNotification(tenantId, { ...payload, user_id })));
  } catch (err) {
    logNotifyFailure('notifyUsers', err);
  }
}

/**
 * Fan out to every active user holding one of `roles` (e.g. all IT_ADMINs).
 * Never throws.
 */
export async function notifyRoles(
  tenantId: string,
  roles: readonly string[],
  payload: NotificationPayload,
  opts?: { excludeUserId?: string },
): Promise<void> {
  try {
    const { rows } = await queryWithTenant<{ user_id: string }>(
      tenantId,
      `SELECT user_id FROM users
        WHERE tenant_id = $1
          AND role = ANY($2::text[])
          AND is_active = true
          AND deleted_at IS NULL`,
      [tenantId, roles as string[]],
    );
    await notifyUsers(tenantId, rows.map((r) => r.user_id), payload, opts);
  } catch (err) {
    logNotifyFailure('notifyRoles', err);
  }
}

/**
 * Teachers connected to a case: the creator (when teacher-role) plus every
 * user the case is shared with (teacher-role). Used for "perkembangan kasus".
 * Never throws.
 */
export async function notifyCaseTeachers(
  tenantId: string,
  caseId: string,
  payload: NotificationPayload,
  opts?: { excludeUserId?: string },
): Promise<void> {
  try {
    const { rows } = await queryWithTenant<{ user_id: string }>(
      tenantId,
      `SELECT DISTINCT rec.user_id FROM (
          SELECT c.created_by AS user_id
            FROM cases c
            JOIN users cu ON cu.user_id = c.created_by
           WHERE c.case_id = $2 AND c.tenant_id = $1
             AND cu.role = ANY($3::text[]) AND cu.deleted_at IS NULL
          UNION
          SELECT cs.shared_with AS user_id
            FROM case_shares cs
            JOIN users u ON u.user_id = cs.shared_with
           WHERE cs.case_id = $2 AND cs.tenant_id = $1
             AND u.role = ANY($3::text[]) AND u.deleted_at IS NULL
       ) rec`,
      [tenantId, caseId, TEACHER_ROLES as unknown as string[]],
    );
    await notifyUsers(tenantId, rows.map((r) => r.user_id), payload, opts);
  } catch (err) {
    logNotifyFailure('notifyCaseTeachers', err);
  }
}

/**
 * Everyone watching a case thread (creator + all shared users, any role) —
 * used for "chat baru / update chat" so both teachers and counselors follow
 * the conversation. Never throws.
 */
export async function notifyCaseWatchers(
  tenantId: string,
  caseId: string,
  payload: NotificationPayload,
  opts?: { excludeUserId?: string },
): Promise<void> {
  try {
    const { rows } = await queryWithTenant<{ user_id: string }>(
      tenantId,
      `SELECT c.created_by AS user_id
         FROM cases c
        WHERE c.case_id = $2 AND c.tenant_id = $1 AND c.created_by IS NOT NULL
       UNION
       SELECT cs.shared_with AS user_id
         FROM case_shares cs
        WHERE cs.case_id = $2 AND cs.tenant_id = $1`,
      [tenantId, caseId],
    );
    await notifyUsers(tenantId, rows.map((r) => r.user_id), payload, opts);
  } catch (err) {
    logNotifyFailure('notifyCaseWatchers', err);
  }
}

/**
 * Notifikasi untuk seorang profesional (konselor / psikolog / perawat).
 * Jadwal & janji temu ditampilkan di dashboard per-role, jadi link diarahkan
 * ke dashboard sesuai role penerima — bukan path tunggal yang hanya cocok
 * untuk satu role. Never throws.
 */
const PROFESSIONAL_DASHBOARDS: Record<string, string> = {
  COUNSELOR: '/dashboard/counselor',
  PSYCHOLOGIST: '/dashboard/psychologist',
  SCHOOL_NURSE: '/dashboard/nurse',
  PERSONAL: '/dashboard/personal',
};

export async function notifyProfessional(
  tenantId: string,
  professionalId: string,
  payload: Omit<NotificationPayload, 'link'>,
): Promise<void> {
  try {
    const { rows } = await queryWithTenant<{ role: string }>(
      tenantId,
      `SELECT role FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, professionalId],
    );
    await createNotification(tenantId, {
      ...payload,
      user_id: professionalId,
      link: PROFESSIONAL_DASHBOARDS[rows[0]?.role ?? ''] ?? '/dashboard',
    });
  } catch (err) {
    logNotifyFailure('notifyProfessional', err);
  }
}

/**
 * SYSTEM_ERROR notifications are the one type that can burst (the same bug
 * hit 50× in a minute would flood the admin inbox), so identical unread
 * errors inside the throttle window collapse into the first notification.
 */
const SYSTEM_ERROR_THROTTLE_MINUTES = 10;

export async function notifySystemError(
  tenantId: string,
  info: { message: string; path?: string },
): Promise<void> {
  try {
    const title = 'Error sistem baru';
    const body = info.path
      ? `${info.message} (di ${info.path})`
      : info.message;

    const { rows } = await queryWithTenant<{ count: string }>(
      tenantId,
      `SELECT COUNT(*)::text AS count FROM notifications
        WHERE tenant_id = $1 AND type = 'SYSTEM_ERROR' AND title = $2
          AND is_read = false AND deleted_at IS NULL
          AND created_at > now() - ($3::text * interval '1 minute')`,
      [tenantId, title, String(SYSTEM_ERROR_THROTTLE_MINUTES)],
    );
    if (Number(rows[0]?.count ?? 0) > 0) return;

    await notifyRoles(tenantId, ADMIN_ROLES, {
      type: 'SYSTEM_ERROR',
      title,
      body,
      link: '/dashboard/audit-logs',
    });
  } catch (err) {
    logNotifyFailure('notifySystemError', err);
  }
}

// ─── Inbox reads / actions (routes — these MAY throw) ───────────────────────

export async function listNotifications(
  tenantId: string,
  userId: string,
  opts?: { dismissed?: boolean; limit?: number },
): Promise<InAppNotificationRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const { rows } = await queryWithTenant<InAppNotificationRow>(
    tenantId,
    `SELECT * FROM notifications
      WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL
        AND dismissed_at IS ${opts?.dismissed ? 'NOT NULL' : 'NULL'}
      ORDER BY created_at DESC
      LIMIT $3`,
    [tenantId, userId, limit],
  );
  return rows;
}

export async function countUnread(tenantId: string, userId: string): Promise<number> {
  const { rows } = await queryWithTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(*)::text AS count FROM notifications
      WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL
        AND dismissed_at IS NULL AND is_read = false`,
    [tenantId, userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(
  tenantId: string,
  userId: string,
  notificationId: string,
  isRead: boolean = true,
): Promise<InAppNotificationRow | null> {
  const { rows } = await queryWithTenant<InAppNotificationRow>(
    tenantId,
    `UPDATE notifications
        SET is_read = $4, read_at = CASE WHEN $4 THEN now() ELSE NULL END
      WHERE tenant_id = $1 AND user_id = $2 AND notification_id = $3 AND deleted_at IS NULL
      RETURNING *`,
    [tenantId, userId, notificationId, isRead],
  );
  return rows[0] ?? null;
}

export async function markAllNotificationsRead(tenantId: string, userId: string): Promise<number> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `UPDATE notifications
        SET is_read = true, read_at = now()
      WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL
        AND dismissed_at IS NULL AND is_read = false`,
    [tenantId, userId],
  );
  return rowCount ?? 0;
}

/** "Close" — hides the row from the inbox but keeps it restorable. */
export async function dismissNotification(
  tenantId: string,
  userId: string,
  notificationId: string,
  dismissed: boolean = true,
): Promise<InAppNotificationRow | null> {
  const { rows } = await queryWithTenant<InAppNotificationRow>(
    tenantId,
    `UPDATE notifications
        SET dismissed_at = CASE WHEN $4 THEN now() ELSE NULL END
      WHERE tenant_id = $1 AND user_id = $2 AND notification_id = $3 AND deleted_at IS NULL
      RETURNING *`,
    [tenantId, userId, notificationId, dismissed],
  );
  return rows[0] ?? null;
}

/** Soft delete — gone for good. */
export async function deleteNotification(
  tenantId: string,
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `UPDATE notifications SET deleted_at = now()
      WHERE tenant_id = $1 AND user_id = $2 AND notification_id = $3 AND deleted_at IS NULL`,
    [tenantId, userId, notificationId],
  );
  return (rowCount ?? 0) > 0;
}

/** Purge every already-closed notification ("Hapus semua yang ditutup"). */
export async function clearDismissedNotifications(tenantId: string, userId: string): Promise<number> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `UPDATE notifications SET deleted_at = now()
      WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL
        AND dismissed_at IS NOT NULL`,
    [tenantId, userId],
  );
  return rowCount ?? 0;
}

/**
 * Warm-up check used by tests / health probes so a broken INSERT surfaces at
 * deploy time instead of silently swallowing every notification afterwards.
 */
export async function notificationsTableReady(tenantId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const res = await client.query(`SELECT 1 FROM notifications LIMIT 1`);
    return res.rowCount !== null;
  } finally {
    client.release();
  }
}
