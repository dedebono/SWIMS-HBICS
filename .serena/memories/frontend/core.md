# Frontend Core (Next.js 16 App Router)
Next 16.2.4 + React 19 + Tailwind v4 + @base-ui/react/shadcn + zustand + axios.
- Routes: `src/app/(auth)/`, `dashboard/` (main staff app), `book/` (counseling booking public flow), `quisioner/` (questionnaire), `login/`.
- Backend errors surfaced in UI are often misleading — check `sudo docker logs swims_backend` before debugging frontend code.
- Design: follow `DESIGN_SYSTEM.md`; polished/WCAG-AA tokens (e.g. `primary-strong`). shadcn components via `components.json`.
- Next 16 has breaking changes vs training data: consult `node_modules/next/dist/docs/` inside frontend/ before writing framework code.
- No unit tests; verification = `npm run build --workspace=frontend`. Prod: frontend baked into Docker image — rebuild to ship.