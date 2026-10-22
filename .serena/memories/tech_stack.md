# Tech Stack
- TypeScript 5.7 monorepo (npm workspaces; `tsconfig.base.json` at root).
- Backend: Express 4 (NOT Nest), tsx runtime, pg (PostgreSQL 16 via pgbouncer :6432), ioredis/Redis, zod validation, jsonwebtoken auth, bcryptjs, node-cron, sharp (image), pdfkit, @aws-sdk/client-s3 (S3/MinIO), firebase-admin (push).
- Frontend: Next.js 16.2.4 (App Router; BREAKING vs older Next — consult `node_modules/next/dist/docs/` in frontend/ before writing code), React 19, @base-ui/react + shadcn, Tailwind v4 (@tailwindcss/postcss), zustand, axios, sonner, date-fns + date-fns-tz.
- Test: vitest 4 (backend, with supertest). No frontend unit tests.
- Deploy: Docker (multi-stage; frontend is BUILT INTO the image — prod changes require rebuilding both images).