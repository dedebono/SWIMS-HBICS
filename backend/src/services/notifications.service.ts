import { auditLog } from '../utils/audit-log.js';
import { queryWithTenant } from '../db/pool.js';

/**
 * HIGH PRIORITY ALERT for employee counseling submissions.
 * Creates an alert record + sends WAHA notification to counselors/psychologists.
 */
export async function sendHighPriorityAlert(
  tenantId: string,
  data: {
    type: 'employee_counseling';
    submission_id: string;
    employee_name: string;
    reason: string;
  },
): Promise<void> {
  // 1. Find counselors and psychologists to notify
  const { rows: recipients } = await queryWithTenant<{ user_id: string; full_name: string }>(
    tenantId,
    `SELECT user_id, full_name FROM users
     WHERE tenant_id = $1 AND role IN ('COUNSELOR', 'PSYCHOLOGIST') AND is_active = true`,
    [tenantId],
  );

  const alertTitle = '🚨 High Priority — Employee Counseling';
  const alertBody = `Karyawan "${data.employee_name}" membutuhkan perhatian segera. Alasan: ${data.reason}`;

  // 2. Insert alert records for each recipient
  for (const r of recipients) {
    await queryWithTenant(
      tenantId,
      `INSERT INTO alerts (tenant_id, student_id, triggered_by, pattern_data, severity, status, assigned_to, expires_at)
       VALUES ($1, $2, $3, $4, 'HIGH', 'PENDING', $5, now() + interval '24 hours')`,
      [
        tenantId,
        null, // no student linked
        data.submission_id, // triggered_by = submission_id as placeholder
        JSON.stringify({ type: data.type, submission_id: data.submission_id, reason: data.reason }),
        r.user_id,
      ],
    );

    // 3. Send WAHA notification if recipient has a phone number
    const { rows: userRows } = await queryWithTenant<{ phone_number: string | null }>(
      tenantId,
      `SELECT phone_number FROM users WHERE user_id = $1`,
      [r.user_id],
    );
    const phone = userRows[0]?.phone_number;
    if (phone) {
      await sendWhatsAppMessage(tenantId, {
        chatId: phone,
        text: `${alertTitle}\n\n${alertBody}\n\nBuka SWIMS untuk melihat detail.`,
      });
    }
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface WhatsAppMessagePayload {
  chatId: string;
  text: string;
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

/**
 * Sends a WhatsApp message via WAHA (WhatsApp HTTP API).
 * Fetches WAHA configuration from tenant settings and sends a text message.
 */
export async function sendWhatsAppMessage(
  tenantId: string,
  payload: WhatsAppMessagePayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch WAHA settings from tenant
    const { rows } = await queryWithTenant<{ settings: any }>(
      tenantId,
      `SELECT settings FROM tenants WHERE tenant_id = $1`,
      [tenantId]
    );

    const settings = rows[0]?.settings || {};
    const wahaConfig = settings.waha || {};

    if (!wahaConfig.url || !wahaConfig.session || !wahaConfig.apiKey) {
      console.error('[WAHA] Missing configuration in tenant settings');
      return { success: false, error: 'WAHA not configured' };
    }

    const wahaUrl = `${wahaConfig.url}/api/sendText`;
    // Normalize phone numbers: strip non-digits unless already a full chatId (contains @)
    let chatId = payload.chatId;
    if (!chatId.includes('@')) {
      chatId = chatId.replace(/[^0-9]/g, '');
    }
    const response = await fetch(wahaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': wahaConfig.apiKey,
      },
      body: JSON.stringify({
        session: wahaConfig.session,
        chatId,
        text: payload.text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WAHA] Failed to send message: ${response.status} ${errorText}`);
      return { success: false, error: `WAHA API error: ${response.status}` };
    }

    console.log(`[WAHA] Message sent successfully to ${payload.chatId}`);

    // Log to audit
    await auditLog({
      action: 'WHATSAPP_MESSAGE_SENT',
      entityType: 'notifications',
      entityId: payload.chatId,
      after: {
        chatId: payload.chatId,
        messageLength: payload.text.length,
        delivery_system: 'WAHA',
      },
      req: undefined,
      tenantId,
      actorId: 'SYSTEM',
    });

    return { success: true };
  } catch (error: any) {
    console.error('[WAHA] Exception while sending message:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
