import { auditLog } from '../utils/audit-log.js';
import { queryWithTenant } from '../db/pool.js';

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
