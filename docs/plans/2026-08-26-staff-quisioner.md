# Staff Mental-Health Quisioner (Anonymous + NIK) + Counselor Follow-up — Plan

**For Hermes:** Implement task-by-task (subagent-driven-development). Verify each before committing.

## Goal
Staff mental-health screening that is **anonymous (no login)**. Flow:
`scan QR → link opens (public page) → user enters NIK → quisioner opens → user fills → submission sent to Counselor`.
Staff are identified by **NIK** (national/employee ID) matched to a pre-registered **PERSONAL** user (column `national_id_hash`, already used for students). Counselor page lists submissions and can create a **meeting** (appointment, type `personal`) for that staff. Admin IT sets the quisioner `target`: `student` (case flow) or `staff` (this flow).

## Architecture
- Public page at `/quisioner/staff?t=<slug>` (outside `/dashboard` so no auth). The QR encodes exactly this URL — "QR hanya buka link". Tenant resolved from `?t=slug`.
- Public endpoints resolve tenant via a new `setTenantFromSlug` middleware (reads `?t`, looks up `tenants.slug`). They do **NOT** use RBAC (anon).
- A new `staff_quisioner_submissions` table stores submissions (FK to `users`).
- Counselor review + meeting endpoints are **authenticated** (COUNSELOR/PSYCHOLOGIST), gated by a new `staff_quisioner` permission resource.
- Quisioner questions/threshold/recommendation logic is **reused** from `quisioner.service`.
- PERSONAL users must have a NIK entered by IT_ADMIN in User Management (backend now persists it).

## Tech
Express + TS backend (`queryWithTenant`, `getClientWithTenant`, `pool`); Postgres migrations; Next.js app-router frontend (`apiClient`, shadcn-like UI); `hashNationalId` from `utils/encryption.ts`; `qrcode.react` for the scan link.

---

## Task 1 — Migration: quisioner target switch
`backend/src/db/migrations/033_add_quisioner_target.sql`
```sql
ALTER TABLE quisioner_settings
  ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'student'
  CHECK (target IN ('student', 'staff'));
```

## Task 2 — Migration: staff quisioner submissions
`backend/src/db/migrations/034_create_staff_quisioner_submissions.sql`
```sql
CREATE TABLE IF NOT EXISTS staff_quisioner_submissions (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  staff_user_id UUID NOT NULL REFERENCES users(user_id),
  total_score   INTEGER NOT NULL,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('professional','internal')),
  answers       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','scheduled','closed')),
  counselor_notes TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_quisioner_tenant ON staff_quisioner_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_quisioner_staff  ON staff_quisioner_submissions(staff_user_id);
```

## Task 3 — Migration: NIK columns on users
`backend/src/db/migrations/036_add_users_national_id.sql`
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_users_national_id_hash ON users(tenant_id, national_id_hash) WHERE deleted_at IS NULL;
```

## Task 4 — Migration: backfill RBAC for `staff_quisioner`
`backend/src/db/migrations/035_backfill_staff_quisioner_permissions.sql`
```sql
INSERT INTO role_permissions (tenant_id, role, resource, action, allowed)
SELECT t.tenant_id, v.role, 'staff_quisioner', v.action, v.allowed
FROM tenants t
CROSS JOIN (VALUES
  ('COUNSELOR','read',true),
  ('COUNSELOR','update',true),
  ('PSYCHOLOGIST','read',true),
  ('PSYCHOLOGIST','update',true),
  ('IT_ADMIN','create',true),
  ('IT_ADMIN','read',true),
  ('IT_ADMIN','update',true),
  ('IT_ADMIN','delete',true)
) AS v(role, action, allowed)
ON CONFLICT (tenant_id, role, resource, action) DO NOTHING;
```

## Task 5 — Permissions seed: add `staff_quisioner` resource
`shared/types/permissions.ts`
- Add `'staff_quisioner'` to the `Resource` union.
- Add `staff_quisioner` key to **every** role (TS `Record<Role, Record<Resource, CrudFlags>>` requires it):
  - `COUNSELOR`, `PSYCHOLOGIST`: `{ read:true, update:true, create:false, delete:false }`
  - `IT_ADMIN`: crud
  - all others (`TEACHER`, `SUBSTITUTE_TEACHER`, `SCHOOL_NURSE`, `SCHOOL_HEAD`, `BOARD_MEMBER`, `CASE_REVIEWER`, `PERSONAL`): `none`

## Task 6 — Shared types
`shared/types/database.ts`
- `UserRow` (line ~96): add `national_id: string | null;` and `national_id_hash: string | null;`
- Add:
```ts
export interface StaffQuisionerSubmissionRow {
  submission_id: string;
  tenant_id: string;
  staff_user_id: string;
  total_score: number;
  recommendation: 'professional' | 'internal';
  answers: unknown;
  status: 'new' | 'reviewed' | 'scheduled' | 'closed';
  counselor_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface StaffQuisionerSubmissionWithStaff extends StaffQuisionerSubmissionRow {
  staff_name: string;
  staff_gender: string;
  staff_email: string | null;
}
```

## Task 7 — Persist NIK on users (admin-users.service)
`backend/src/services/admin-users.service.ts`
- Import `hashNationalId` and `encryptField` from `../utils/encryption.js`.
- In **`createUser`** STAFF branch (else block ~line 72-84): if `data.national_id`, compute `const nidHash = hashNationalId(data.national_id); const enc = encryptField(data.national_id);` and include `national_id, national_id_hash` in the INSERT (+ params). Add a dedupe check (hash) for PERSONAL like the student one.
- In **`updateUser`** STAFF branch (~line 190-239): if `data.national_id !== undefined`, compute hash + enc and push `national_id = $`, `national_id_hash = $` into updates/values. (Schema already accepts `national_id` for both create & update.)
- `UpdateUserData` already has `national_id?` — keep.

**Verify:** `SELECT national_id_hash FROM users WHERE role='PERSONAL' LIMIT 1;` returns non-null after IT_ADMIN sets a NIK.

## Task 8 — Quisioner settings service (target)
`backend/src/services/quisioner-settings.service.ts` — add:
```ts
export async function getSettings(tenantId: string): Promise<{ threshold: number; target: 'student' | 'staff' }> {
  const { rows } = await queryWithTenant<{ threshold: number; target: string }>(
    tenantId, `SELECT threshold, target FROM quisioner_settings WHERE tenant_id = $1`, [tenantId]);
  if (rows[0]) return { threshold: rows[0].threshold, target: rows[0].target as 'student' | 'staff' };
  const { rows: ins } = await queryWithTenant<{ threshold: number; target: string }>(
    tenantId, `INSERT INTO quisioner_settings (tenant_id, threshold, target) VALUES ($1, 7, 'student')
               ON CONFLICT (tenant_id) DO UPDATE SET threshold = EXCLUDED.threshold RETURNING threshold, target`, [tenantId]);
  return { threshold: ins[0].threshold, target: ins[0].target as 'student' | 'staff' };
}
export async function setSettings(tenantId: string, data: { threshold?: number; target?: 'student' | 'staff' }): Promise<void> {
  const sets: string[] = []; const vals: unknown[] = [tenantId]; let i = 2;
  if (data.threshold !== undefined) { sets.push(`threshold = $${i++}`); vals.push(data.threshold); }
  if (data.target !== undefined) { sets.push(`target = $${i++}`); vals.push(data.target); }
  if (sets.length) await queryWithTenant(tenantId, `UPDATE quisioner_settings SET ${sets.join(', ')} WHERE tenant_id = $1`, vals);
}
```
Keep existing `getThreshold`/`setThreshold` (student flow still uses them).

## Task 9 — Tenant-from-slug middleware
`backend/src/middleware/tenant.middleware.ts` — add:
```ts
import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';
export async function setTenantFromSlug(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = (req.query.t as string) || (req.body && (req.body as any).tenant);
    if (!slug) return next(new Error('tenant slug required'));
    const { rows } = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM tenants WHERE slug = $1 AND deleted_at IS NULL', [slug]);
    if (!rows.length) return next(new Error('tenant not found'));
    (req as any).tenantId = rows[0].tenant_id;
    next();
  } catch (err) { next(err); }
}
```

## Task 10 — Staff quisioner service
`backend/src/services/staff-quisioner.service.ts`
```ts
import { queryWithTenant, getClientWithTenant } from '../db/pool.js';
import { calculateScore, getRecommendation } from './quisioner.service.js';
import { createAppointment } from './appointments.service.js';
import { hashNationalId } from '../utils/encryption.js';
import { auditLog } from '../utils/audit.js';
import { sendEmail } from './email.service.js';
import type { StaffQuisionerSubmissionWithStaff } from '@swims/shared';

export async function verifyNik(tenantId: string, nik: string): Promise<{ valid: boolean; staff_name?: string }> {
  const hash = hashNationalId(nik);
  const { rows } = await queryWithTenant<{ user_id: string; full_name: string }>(
    tenantId,
    `SELECT user_id, full_name FROM users WHERE tenant_id = $1 AND national_id_hash = $2 AND role = 'PERSONAL' AND is_active = true`,
    [tenantId, hash]);
  return rows[0] ? { valid: true, staff_name: rows[0].full_name } : { valid: false };
}

export async function submitStaffQuisioner(tenantId: string, data: { nik: string; answers: Array<{ question_id: string; answer_text?: string; score: number }> }) {
  const v = await verifyNik(tenantId, data.nik);
  if (!v.valid) throw new Error('NIK tidak terdaftar sebagai staff.');
  const staff = await queryWithTenant<{ user_id: string; email: string | null }>(
    tenantId, `SELECT user_id, email FROM users WHERE tenant_id = $1 AND national_id_hash = $2 AND role='PERSONAL'`,
    [tenantId, hashNationalId(data.nik)]);
  const staffUserId = staff.rows[0]!.user_id;
  const score = calculateScore(data.answers);
  const recommendation = await getRecommendation(score);
  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO staff_quisioner_submissions (tenant_id, staff_user_id, total_score, recommendation, answers)
       VALUES ($1,$2,$3,$4,$5) RETURNING submission_id`,
      [tenantId, staffUserId, score, recommendation, JSON.stringify(data.answers)]);
    await client.query('COMMIT');
    return { submission_id: rows[0].submission_id, score, recommendation };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

export async function listStaffSubmissions(tenantId: string, opts: { status?: string } = {}): Promise<StaffQuisionerSubmissionWithStaff[]> {
  const params: unknown[] = [tenantId]; let sql = `
    SELECT s.*, u.full_name AS staff_name, u.gender AS staff_gender, u.email AS staff_email
    FROM staff_quisioner_submissions s JOIN users u ON u.user_id = s.staff_user_id
    WHERE s.tenant_id = $1 AND s.deleted_at IS NULL`;
  if (opts.status) { params.push(opts.status); sql += ` AND s.status = $${params.length}`; }
  sql += ` ORDER BY s.created_at DESC`;
  const { rows } = await queryWithTenant(tenantId, sql, params);
  return rows as unknown as StaffQuisionerSubmissionWithStaff[];
}
export async function getStaffSubmission(tenantId: string, id: string) {
  const { rows } = await queryWithTenant(tenantId,
    `SELECT s.*, u.full_name AS staff_name, u.gender AS staff_gender, u.email AS staff_email
     FROM staff_quisioner_submissions s JOIN users u ON u.user_id=s.staff_user_id
     WHERE s.tenant_id=$1 AND s.submission_id=$2 AND s.deleted_at IS NULL`, [tenantId, id]);
  return rows[0] ?? null;
}
export async function updateStaffSubmission(tenantId: string, id: string, data: { status?: string; counselor_notes?: string }, actorId: string) {
  const sets: string[] = []; const vals: unknown[] = [tenantId, id]; let i = 3;
  if (data.status) { sets.push(`status=$${i++}`); vals.push(data.status); }
  if (data.counselor_notes !== undefined) { sets.push(`counselor_notes=$${i++}`); vals.push(data.counselor_notes); }
  sets.push(`updated_at=now()`);
  const { rows } = await queryWithTenant(tenantId,
    `UPDATE staff_quisioner_submissions SET ${sets.join(', ')} WHERE tenant_id=$1 AND submission_id=$2 RETURNING *`, vals);
  const u = rows[0] ?? null;
  if (u) await auditLog({ action:'STAFF_QUISIONER_UPDATED', entityType:'staff_quisioner_submissions', entityId:id, after:u as unknown as Record<string,unknown>, tenantId, actorId });
  return u;
}
export async function createMeetingFromSubmission(tenantId: string, id: string, data: { counselor_id: string; location?: 'online'|'offline'; notes?: string; scheduled_at?: string }, actorId: string) {
  const sub = await getStaffSubmission(tenantId, id);
  if (!sub) throw new Error('Submission not found');
  const appt = await createAppointment(tenantId, {
    type: 'personal', created_by: actorId, created_for: sub.staff_user_id,
    counselor_id: data.counselor_id, location: data.location,
    notes: data.notes ?? `Follow-up quisioner staff (skor ${sub.total_score}, rekomendasi ${sub.recommendation}).`,
  });
  await updateStaffSubmission(tenantId, id, { status: 'scheduled' }, actorId);
  if (data.scheduled_at) await queryWithTenant(tenantId,
    `UPDATE appointments SET status='confirmed', scheduled_at=$1, updated_at=now() WHERE appointment_id=$2`, [data.scheduled_at, appt.appointment_id]);
  // notify staff via email (PERSONAL user email)
  if (sub.staff_email) {
    try { await sendEmail(tenantId, { to: sub.staff_email, subject: 'Undangan Janji Temu Konseling', body: `Halo ${sub.staff_name}, counselor telah menjadwalkan pertemuan konseling.` }); } catch {}
  }
  return appt;
}
```
**Verify imports exist:** `calculateScore`, `getRecommendation` (quisioner.service), `createAppointment` (appointments.service), `hashNationalId` (encryption), `auditLog` (utils/audit — confirm path), `sendEmail` (email.service — confirm signature). Grep before writing.

## Task 11 — Routes (public + protected in one file)
`backend/src/api/staff-quisioner.routes.ts` — single router, **per-route middleware** (no global auth):
```ts
import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { setTenantContext } from '../middleware/tenant.middleware.js';
import { setTenantFromSlug } from '../middleware/tenant.middleware.js';
import { checkPermission } from '../middleware/permissions.middleware.js';
import * as quisionerService from '../services/quisioner.service.js';
import * as staffService from '../services/staff-quisioner.service.js';
import * as settingsService from '../services/quisioner-settings.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

const router = Router();

// ── PUBLIC (anon, NIK) ──────────────────────────────────────────────
router.get('/quisioner/staff/config', setTenantFromSlug, asyncHandler(async (req, res) => {
  const s = await settingsService.getSettings((req as any).tenantId);
  sendSuccess(res, s);
}));
router.post('/quisioner/staff/verify-nik', setTenantFromSlug, asyncHandler(async (req, res) => {
  const { tenant, nik } = req.body as { tenant: string; nik: string };
  sendSuccess(res, await staffService.verifyNik((req as any).tenantId, nik));
}));
router.get('/quisioner/staff/questions', setTenantFromSlug, asyncHandler(async (req, res) => {
  sendSuccess(res, await quisionerService.listQuestions((req as any).tenantId));
}));
router.get('/quisioner/staff/questions/:qid/answers', setTenantFromSlug, asyncHandler(async (req, res) => {
  sendSuccess(res, await quisionerService.listAnswers((req as any).tenantId, req.params.qid));
}));
router.post('/quisioner/staff/submit', setTenantFromSlug, asyncHandler(async (req, res) => {
  const { tenant, nik, answers } = req.body as { tenant: string; nik: string; answers: any[] };
  sendCreated(res, await staffService.submitStaffQuisioner((req as any).tenantId, { nik, answers }));
}));

// ── PROTECTED (authenticated) ──────────────────────────────────────
router.get('/quisioner/tenant-slug', authenticate, setTenantContext, asyncHandler(async (req, res) => {
  const { rows } = await (await import('../db/pool.js')).pool.query<{ slug: string }>(
    'SELECT slug FROM tenants WHERE tenant_id = $1', [req.tenantId!]);
  sendSuccess(res, { slug: rows[0]?.slug });
}));
router.get('/quisioner/settings', authenticate, setTenantContext, checkPermission('quisioner','read'), asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.getSettings(req.tenantId!));
}));
router.patch('/quisioner/settings', authenticate, setTenantContext, checkPermission('quisioner','update'), asyncHandler(async (req, res) => {
  const { threshold, target } = req.body as { threshold?: number; target?: 'student'|'staff' };
  await settingsService.setSettings(req.tenantId!, { threshold, target });
  sendSuccess(res, await settingsService.getSettings(req.tenantId!));
}));
router.get('/counselor/staff-submissions', authenticate, setTenantContext, checkPermission('staff_quisioner','read'), asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  sendSuccess(res, await staffService.listStaffSubmissions(req.tenantId!, { status }));
}));
router.get('/counselor/staff-submissions/:id', authenticate, setTenantContext, checkPermission('staff_quisioner','read'), asyncHandler(async (req, res) => {
  const sub = await staffService.getStaffSubmission(req.tenantId!, req.params.id);
  if (!sub) return res.status(404).json({ message: 'Not found' });
  sendSuccess(res, sub);
}));
router.patch('/counselor/staff-submissions/:id', authenticate, setTenantContext, checkPermission('staff_quisioner','update'), asyncHandler(async (req, res) => {
  const u = await staffService.updateStaffSubmission(req.tenantId!, req.params.id, req.body, req.userId!);
  if (!u) return res.status(404).json({ message: 'Not found' });
  sendSuccess(res, u);
}));
router.post('/counselor/staff-submissions/:id/meeting', authenticate, setTenantContext, checkPermission('staff_quisioner','update'), asyncHandler(async (req, res) => {
  const { counselor_id, location, notes, scheduled_at } = req.body as any;
  sendCreated(res, await staffService.createMeetingFromSubmission(req.tenantId!, req.params.id, { counselor_id, location, notes, scheduled_at }, req.userId!));
}));

export default router;
```
Mount in `backend/src/index.ts`: `import staffQuisionerRoutes from './api/staff-quisioner.routes.js';` and `app.use('/api', staffQuisionerRoutes);` (near the other root-level `app.use('/api', ...)` routers).

**Security:** add a light rate-limit on `POST /quisioner/staff/submit` and `/verify-nik` (per-IP) to avoid anonymous spam — reuse the login rate-limit pattern or a simple in-memory map. Note in code.

## Task 12 — Frontend: QuisionerForm component
`frontend/src/components/quisioner/QuisionerForm.tsx` — props `{ questions, answersMap, answers, onAnswerChange, threshold, totalScore, recommendation, submitting, onSubmit }`. Render the same blocks as `counseling-tab.tsx` (multiple_choice checkbox cards, rating chips, text Textarea). Do NOT refactor `counseling-tab.tsx` (avoid regression).

## Task 13 — Frontend: PUBLIC staff quisioner page (anon + NIK)
`frontend/src/app/quisioner/staff/page.tsx` (`'use client'`, **outside** `/dashboard` so no auth gate):
- Read `?t=` via `useSearchParams()`. If missing → error "Link tidak valid".
- On mount: `GET /quisioner/staff/config?t=slug`. If `target !== 'staff'` → show "Quisioner staff belum diaktifkan oleh Admin IT."
- Step 1 (NIK): input NIK → `POST /quisioner/staff/verify-nik` {tenant:slug, nik}. If `!valid` → error "NIK tidak terdaftar." If valid → show greeting "Halo {staff_name}" + proceed.
- Step 2 (quisioner): load `/quisioner/staff/questions?t=slug` + per-question `/quisioner/staff/questions/:id/answers?t=slug` (Promise.all like counseling-tab). Render `<QuisionerForm .../>`.
- Submit → `POST /quisioner/staff/submit` {tenant:slug, nik, answers} → success card with recommendation + "Terima kasih, hasil telah dikirim ke konselor."
- No sidebar/nav (standalone public page). Use `Card` + minimal styling.

## Task 14 — Frontend: COUNSELOR staff-quisioner page
`frontend/src/app/dashboard/counselor/staff-quisioner/page.tsx` (`'use client'`, role guard COUNSELOR/PSYCHOLOGIST):
- Load `GET /counselor/staff-submissions` → table: staff name, gender, score, recommendation, status, date.
- Row → dialog: pretty-print `answers` JSONB, staff info, status `<Select>` (new/reviewed/scheduled/closed) + notes `<Textarea>` → `PATCH /counselor/staff-submissions/:id`.
- "Buat Pertemuan" → dialog: counselor = current user (pre-filled), location select, notes, optional `scheduled_at` → `POST /counselor/staff-submissions/:id/meeting`. On success toast + refresh; staff gets email notification (handled backend).
- NOTE: if `target !== 'staff'`, show disabled message (quisioner is for students).

## Task 15 — Sidebar nav
`frontend/src/components/layout/sidebar.tsx`:
- Add for COUNSELOR + PSYCHOLOGIST: `{ label: 'Quisioner Staff', href: '/dashboard/counselor/staff-quisioner', roles: ['COUNSELOR','PSYCHOLOGIST'] }`.
- (No PERSONAL item — the staff page is public/anon.)

## Task 16 — Admin IT quisioner page: target + QR
`frontend/src/app/dashboard/admin/quisioner/page.tsx`:
- Add `qrcode.react` to `frontend/package.json` deps (`"qrcode.react": "^4.2.0"`).
- Load `GET /quisioner/settings` → `{ threshold, target }`; keep threshold save (PATCH includes `target`).
- Add `Card` "Penggunaan Quisioner" with `Select` (Siswa — case / Staff — laman quisioner staff) bound to `target`; PATCH on change.
- Fetch slug: `GET /quisioner/tenant-slug` → render `<QRCodeSVG value={`${window.location.origin}/quisioner/staff?t=${slug}`} />` + "Salin Link" button. (This is the QR staff scan — it only opens the link.)

## Task 17 — Gate student counseling-tab by target
`frontend/src/components/counseling/couisioner-tab.tsx` (typo aside): in load effect also `GET /quisioner/settings` (or `/quisioner/threshold` extended). If `target !== 'student'`, render the "Fitur quisioner siswa nonaktif" placeholder (same pattern as the existing `!isTeacher` guard).

## Task 18 — Commit (+ optional push/deploy)
- `git add` intended files only (never `backend/uploads/**`).
- `git commit -m "feat: anonymous staff quisioner (NIK) + counselor follow-up"`.
- `git fetch origin && git rev-list --left-right --count origin/main...HEAD` → must print `0\t<N>`.
- `git push origin main` only if user asks.
- Deploy here if asked: `sudo docker system prune -a -f && sudo docker builder prune -f && sudo docker compose up -d --build` (frontend image baked — needs rebuild). Then `sudo docker compose restart backend` (clears 60s permission cache so new `staff_quisioner` resource is live).

---

## Verification (end-to-end, on this machine after deploy)
1. DB: `SELECT target FROM quisioner_settings WHERE tenant_id='<hbics>';` → `student`.
2. IT_ADMIN → User Management → edit a PERSONAL user → set NIK → save. `SELECT national_id_hash FROM users WHERE role='PERSONAL' AND full_name=...;` → non-null.
3. IT_ADMIN → Admin Quisioner → set target = `staff` → QR appears (`/quisioner/staff?t=hbics`).
4. Open public page (incognito / no login) → enter that NIK → quisioner opens → fill → submit → "Terima kasih".
5. COUNSELOR → "Quisioner Staff" → submission listed → open → "Buat Pertemuan" → appointment created; PERSONAL user gets email.
6. Backend logs: public endpoints succeed without 401; counselor endpoints 200 (not 403); `role_permissions` has backfilled `staff_quisioner` rows.

## Pitfalls (SWIMS skill)
- **Frontend is a baked image** → any frontend change needs full `docker compose up -d --build` (or `build frontend`). Backend-only change → `restart backend`.
- **LSP false positives** on host (no tsc) → ignore JSX/@types noise; trust only missing-export/wrong-import.
- **`qrcode.react`** installed at container build time (in `package.json`) → works after rebuild.
- **RLS**: public endpoints set `req.tenantId` via `setTenantFromSlug` and call `queryWithTenant` → RLS `app.tenant_id` set correctly. The `pool.query` in `setTenantFromSlug` is on `tenants` (no RLS) — fine.
- **Same-gender rule**: the meeting is created by the counselor (creator = counselor), so the existing same-gender restriction (which applies to the *staff* picking a counselor) doesn't block counselor-initiated meetings. Acceptable; note if you want it enforced both ways.
- **Audit**: submissions created anonymously have no `actorId` — `auditLog` calls in this flow use the resolved staff user id where appropriate, or omit actor for the public submit (the submit endpoint itself doesn't call auditLog; the counselor update/meeting do, with `req.userId`).
