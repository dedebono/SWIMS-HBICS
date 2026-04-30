import cron from 'node-cron';
import { runPatternDetectionForTenant } from '../services/pattern-detection.service.js';
import { runDataLifecycleForTenant } from '../services/data-lifecycle.service.js';
import { pool } from '../db/pool.js';

export function initCronJobs() {
  console.log('[CRON] Initializing scheduled jobs...');

  // Run daily at midnight 00:00
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Starting Daily Automated Worker Tasks...');
    try {
      // 1. Fetch all active tenants
      const { rows } = await pool.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM tenants WHERE deleted_at IS NULL`
      );

      for (const tenant of rows) {
        console.log(`[CRON] Processing tenant ${tenant.tenant_id}`);
        // 2. Pattern Detections (Section 6.2)
        await runPatternDetectionForTenant(tenant.tenant_id);
        
        // 3. Data Lifecycle Engine (Section 6.3)
        await runDataLifecycleForTenant(tenant.tenant_id);
      }
      console.log('[CRON] Daily Automated Worker Tasks completed successfully.');
    } catch (err) {
      console.error('[CRON] Daily Automated Worker Tasks failed:', err);
    }
  });
}
