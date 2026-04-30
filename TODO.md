# Backend Test Fix Plan

## Steps:
- [x] Step 1: Edit backend/vitest.config.ts to fix setupFiles path resolution for root CWD
- [x] Step 2: Re-run tests with `npx vitest run --config backend/vitest.config.ts` (setup fixed, now addressing env validation crash)
- [x] Step 3: Fix env validation to provide test defaults instead of process.exit(1)
- [x] Step 4: Re-run tests fully with test env defaults
- [x] Step 5: Enhanced global mocks for pool exports, bcryptjs, db/pool.js (fixed getClientWithTenant, pool, auditPool); updated TODO.md
- [x] Step 6: Mock pool.query to return proper { rows: [{ tenant_id: 'tenant-123' }] } for tenant.middleware tenant verification
- [x] Step 7: Fixed pg Pool mock mClient.query and mPool.query defaults for global tenant query success
- [ ] Step 8: Fix per-test vi.doMock conflicts with global setup (use vi.hoisted or dynamic imports consistently)
- [ ] Step 9: Mock all individual service functions globally or fix test-specific mocking
- [ ] Step 10: Mark all tests passing

Run `npx vitest run --config backend/vitest.config.ts` to test fixes.

