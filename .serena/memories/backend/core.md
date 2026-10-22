# Backend Core (Express API)
Express 4 + tsx + pg. Entry `src/server.ts`. Layers: `api/*.routes.ts` → `services/*.service.ts` → `db/pool.ts` (raw SQL). ~30 route domains incl. incidents, cases, case-shares, students, appointments, counseling-booking, employee-counseling, psychologist-referral, quisioner, discipline-handbook, positive-observations, interventions, referrals, consents, communications, notifications, alerts, insights/ai-insights, analytics, reports, media, avatar, admin, admin-users, admin-settings, auth, audit-logs, onboarding, availability, guidebook.
- Auth: JWT (`auth.service.ts`), captcha on login (`captcha.service.ts`).
- Background: `src/jobs/` with node-cron.
- Media: S3/MinIO via @aws-sdk; per-file storage backend recorded in `media_assets.storage_backend` — reads dispatch on that column.
- Tests in `src/api/__tests__/` + `src/services/__tests__/` (vitest + supertest). Verify with `npx vitest run` (tsc --noEmit broken pre-existing).
- Migrations `src/db/migrations/`, run via `npm run migrate`. Schema truth lives there — e.g. incidents.reported_by.