# Suggested Commands
All from repo root unless noted (npm workspaces):
- Dev both: `npm run dev` (concurrently) · backend only: `npm run dev:backend` (tsx watch) · frontend: `npm run dev:frontend` (next dev)
- Backend tests (from backend/): `npx vitest run` — THIS is the verification tool.
- Migrate/seed: `npm run migrate` / `npm run seed`.
- Infra: `docker compose -f docker-compose.dev.yml up -d` (dev) / `docker compose up -d --build` (prod).
- Prod logs (debugging first stop — frontend error messages mislead): `sudo docker logs swims_backend --tail 100`.
- NOTE: `npx tsc --noEmit` in backend has PRE-EXISTING errors — fails regardless of your changes. Do NOT use typecheck as pass/fail; use `npx vitest run`.
- Standard Linux utils (this is Linux; nothing exotic).