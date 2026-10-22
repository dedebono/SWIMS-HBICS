/**
 * E2E smoke test for the GOWA transport.
 *
 * Calls the PRODUCTION `sendWhatsAppMessage()` (the same function
 * appointments.service.ts and psychologist-referral.service.ts call) against
 * the real GOWA server, and asserts the API answered SUCCESS.
 *
 * Run inside the backend container so it uses the deployed env:
 *   sudo docker cp backend/scripts/send-gowa-smoke.mjs swims_backend:/app/scripts/
 *   sudo docker exec -e TENANT_ID=... swims_backend node /app/scripts/send-gowa-smoke.mjs
 */
const TENANT = process.env.TENANT_ID;
const TO = process.env.TO_NUMBER || '6289650309013';

if (!TENANT) throw new Error('TENANT_ID env required');

const { sendWhatsAppMessage } = await import('../backend/src/services/notifications.service.js');

console.log(`tenant : ${TENANT}`);
console.log(`to     : ${TO}`);

const started = Date.now();
const res = await sendWhatsAppMessage(TENANT, {
  chatId: TO,
  text: `SWIMS-HBICS GOWA migration test ${new Date().toISOString()}`,
});
const ms = Date.now() - started;

console.log(`result : success=${res.success} messageId=${res.messageId ?? '(none)'} (${ms}ms)`);

if (!res.success) {
  console.error('❌ sendWhatsAppMessage did not report success');
  process.exit(1);
}
if (!res.messageId) {
  console.error('❌ no message_id in the GOWA response');
  process.exit(1);
}
console.log('✅ GOWA accepted the message (code=SUCCESS, message_id present)');
process.exit(0);
