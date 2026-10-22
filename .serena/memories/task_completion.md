# Task Completion Checklist
1. Backend: run `npx vitest run` from `backend/` — all tests must pass. This replaces typecheck (tsc --noEmit is broken pre-existing).
2. Frontend: `npm run build --workspace=frontend` must succeed if frontend changed.
3. If DB changed: write a migration in `backend/src/db/migrations/` and run `npm run migrate`.
4. Prod deploy: rebuild BOTH docker images (frontend is baked into its image); verify via `sudo docker logs swims_backend` that the new code is live — don't trust the UI error surface.
5. Verify behavior end-to-end (hit the actual endpoint/page), don't stop at code passing.