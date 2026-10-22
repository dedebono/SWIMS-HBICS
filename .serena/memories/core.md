# SWIMS-HBICS — Core
Student Wellbeing & Incident Management System (school student-welfare cases/incidents). npm workspaces monorepo: `backend/` + `frontend/` + `shared/`.

## Layout
- `backend/` — Express + TS API. `src/api/*.routes.ts` (~30 route files: incidents, cases, students, appointments, media, admin, notifications, quisioner, discipline-handbook, counseling-booking, ...), `src/services/*.service.ts`, `src/db/` (pool.ts, migrate.ts, seed.ts, migrations/), `src/middleware/`, `src/jobs/`, `src/test/`. Entry: `src/server.ts` (app wiring) + `src/index.ts`.
- `frontend/` — Next.js App Router. `src/app/` route groups: `(auth)/`, `dashboard/`, `book/`, `quisioner/`, `login/`. `src/components/`, `src/hooks/`, `src/lib/`. Design system docs: `frontend/DESIGN_SYSTEM.md`.
- `shared/` — `schemas/`, `types/` (@swims/shared, consumed by both).
- Infra: `docker-compose.yml` (prod) / `docker-compose.dev.yml`; postgres 16 + pgbouncer + redis (+MinIO media).

## Key invariants
- Incident schema uses `reported_by` (NOT created_by).
- `media_assets.storage_backend` records WHERE each file lives; reads dispatch on it, not on tenant's current setting — switching storage providers never orphans files.
- RBAC is dynamic: per-role permissions managed at runtime in User Management UI, not hardcoded.
- Read module cores first: `mem:backend/core`, `mem:frontend/core`.

See also: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.