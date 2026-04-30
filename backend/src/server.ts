import { app } from './index.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { initCronJobs } from './jobs/cron.js';

let server: any;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(env.PORT, () => {
    console.log(`
🚀 SWIMS API running on http://localhost:${env.PORT}`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   Frontend URL: ${env.FRONTEND_URL}
`);
    
    // Kickoff background CRON logic
    initCronJobs();
  });
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log('
🛑 Shutting down gracefully...');
  if (server) server.close();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED_REJECTION]', err);
});
