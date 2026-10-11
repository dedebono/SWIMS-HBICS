import { auditLog } from '../utils/audit-log.js';
import { getWahaSettings } from './tenant-settings.service.js';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Sends a WhatsApp message via WAHA (WhatsApp HTTP API).
 *
 * URL / session / API key come from the tenant's saved Pengaturan Sistem
 * (falling back to env, then to the old hardcoded default). This used to read
 * `env.WAHA_URL` and hardcode `session: 'default'`, so everything an IT admin
 * typed into the WhatsApp panel was ignored — the settings were never even
 * stored, and even once stored nothing read them.
 */
export async function sendWhatsAppMessage(
  tenantId: string,
  payload: { chatId: string; text: string },
): Promise<{ success: boolean; messageId?: string }> {
  const { url: wahaUrl, session, apiKey: wahaApiKey } = await getWahaSettings(tenantId);

  try {
    const res = await fetch(`${wahaUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': wahaApiKey,
      },
      body: JSON.stringify({
        session,
        chatId: payload.chatId,
        text: payload.text,
      }),
    });

    if (!res.ok) {
      console.error(`[WAHA] Failed to send message: ${res.status} ${res.statusText}`);
      return { success: false };
    }

    const data = (await res.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error('[WAHA] Error sending WhatsApp message:', err);
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
