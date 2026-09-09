# SWIMS (Student Wellbeing and Incident Management System)

SWIMS is a comprehensive, multi-tenant SaaS platform designed to help schools and educational institutions monitor student wellbeing, manage disciplinary and medical cases, track interventions, and generate advanced analytics. 

Built with modern web technologies, SWIMS features a robust Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC) system, ensuring data privacy and security across various user roles (e.g., Counselors, Teachers, IT Admins, School Heads, Nurses, etc.).

## 🚀 Key Features

- **Multi-Tenant SaaS Architecture**: Scalable architecture to support multiple schools/districts within a single deployment.
- **Granular Access Control**: Advanced RBAC and ABAC ensuring data minimization, privacy, and contextual access (e.g., Teachers only see their assigned students, Nurses only handle medical incidents). Permissions are dynamic per-role via IT Admin dashboard.
- **Incident & Case Management**: Complete lifecycle tracking for behavioral and medical incidents, case escalations, and interventions.
- **Positive Observations**: Dedicated tracking for positive reinforcement and student achievements.
- **AI-Powered Insights**: Integrated AI analysis (powered by Ollama/Local LLMs) to detect patterns, evaluate intervention efficacy, and summarize student records.
- **Secure Media Assets**: AWS S3/Firebase integrated secure file handling, redaction support, and presigned uploads for sensitive evidence tracking.
- **Right to Be Forgotten (RTBF)**: Compliance with data privacy regulations (GDPR/FERPA) allowing IT Admins to securely scrub PII.
- **Comprehensive Audit Logging**: Immutable audit trails for all sensitive data access and system modifications.
- **WAHA WhatsApp Integration**: Appointment notifications sent automatically via WAHA HTTP API to student/guardian phone numbers. Phone numbers managed by IT Admin.
- **Quisioner Module**: Staff and student quisioner forms for data collection. IT Admin manages quisioner configuration.
- **Social Media Scheduling (Repliz)**: Automated daily Threads/Twitter posts via Repliz API — news threads, quotes, and motivational content scheduled at peak engagement hours (WIB).

## 🛠 Tech Stack

### Frontend
- **Framework**: [Next.js](https://nextjs.org/) 16 (App Router) + React 19
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + Base UI / Shadcn UI + Radix primitives
- **State & Data Fetching**: Zustand (global state) + custom `apiClient` (fetch wrapper)
- **Utilities**: lucide-react (icons), sonner (toasts), date-fns, qrcode.react (QR booking), papaparse

### Backend
- **Runtime**: Node.js 20 (Alpine) + [Express](https://expressjs.com/) 4
- **Language**: TypeScript 5 (dev via `tsx watch`, build via `tsc`)
- **Database**: PostgreSQL 16 + PgBouncer (connection pooling) via `pg`
- **Cache / Jobs**: Redis 7 (`ioredis`), node-cron
- **Object Storage**: MinIO (S3-compatible) via AWS SDK S3
- **Validation**: Zod
- **Auth**: JWT (`jsonwebtoken`) + `bcryptjs`; Firebase SSO-ready
- **Mail / PDF**: nodemailer, pdfkit
- **WhatsApp**: WAHA HTTP API (`axios`) — appointment notifications to student/guardian phones
- **Social Media**: Repliz API (`axios`) — automated Threads/Twitter scheduling
- **Testing**: Vitest + Supertest
- **AI**: Ollama integration for on-premise/local LLM insights

### Infrastructure
- **Orchestration**: Docker Compose (postgres, pgbouncer, redis, minio, backend, frontend)
- **Multi-tenancy**: faux Row-Level Security via `app.tenant_id` session config + tenant-scoped queries

## 📁 Project Structure

This project is organized as a monorepo containing the following workspaces:

```text
SWIMS/
├── frontend/           # Next.js web application
├── backend/            # Express.js REST API server
├── shared/             # Shared TypeScript types, schemas, and permissions matrix
└── docker-compose.yml  # Docker environment orchestration (DB, Redis, etc.)
```

## ⚙️ Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- Docker (optional, for running local services)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/dedebono/SWIMS-HBICS.git
   cd SWIMS
   ```

2. **Install dependencies**
   Install packages from the root of the project to setup the monorepo workspaces:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   - Copy `.env.example` to `.env` in both the `frontend` and `backend` directories.
   - Update the configuration values (Database connection, JWT secrets, etc.).

4. **Database Setup & Migrations**
   Initialize the PostgreSQL database:
   ```bash
   cd backend
   npm run migrate
   npm run seed
   ```

### Running Locally

You can run both the frontend and backend concurrently from the root (if configured), or run them individually:

**Backend API:**
```bash
cd backend
npm run dev
```

**Frontend App:**
```bash
cd frontend
npm run dev
```

### Running Tests
The backend test suite ensures 100% stability across all endpoint validations and permissions.
```bash
cd backend
npm run test
```

## 🔒 Security & Privacy
SWIMS is built with student privacy as a primary concern. Features like strict RBAC/ABAC matrices, automated data redaction, secure media URLs, and extensive audit logging ensure compliance with educational data standards.

## 📐 System Documentation & Diagrams

### 🗺 Site Map

```mermaid
graph TD
  A["SWIMS-HBICS"] --> PUB["Public / No Auth"]
  A --> AUTH["Dashboard - Role Based"]

  PUB --> QR["/qr/[token] - Public Counseling Booking"]
  PUB --> QS["/quisioner/staff - Staff Quisioner Form"]
  PUB --> LG["/login"]

  AUTH --> CO["Counselor"]
  AUTH --> PS["School Psychologist"]
  AUTH --> SH["School Head"]
  AUTH --> NU["School Nurse"]
  AUTH --> AD["IT Admin / Super Admin"]
  AUTH --> TC["Teacher / Substitute"]
  AUTH --> ST["Student"]
  AUTH --> RV["Reviewer"]

  CO --> CO1["Dashboard"]
  CO --> CO2["Availability - set counseling schedule"]
  CO --> CO3["Janji Temu & Rujukan Saya: Hasil Sesi + Buat Rujukan + Hasil Puspaga"]
  PS --> PS1["Dashboard"]
  PS --> PS2["Availability"]
  PS --> PS3["Janji Temu Psikolog (awaiting_psychologist_availability)"]
  SH --> SH1["Dashboard + Pending Approvals"]
  SH --> SH2["Persetujuan Rujukan (Approve / Reject)"]
  SH --> SH3["Audit Logs"]
  NU --> NU1["Medical Incidents"]
  NU --> NU2["Isi Hasil Puspaga"]
  AD --> AD1["User / Role / Permission Mgmt"]
  AD --> AD2["Tenant Settings + RTBF"]
  AD --> AD3["Quisioner Management"]
  AD --> AD4["Discipline Handbook"]
  TC --> TC1["Students / Incidents / Cases / Observations / Quisioner"]
  ST --> ST1["Own records / Quisioner"]
  RV --> RV1["Dashboard / Board - aggregated view"]
```

### 👥 Use Case Diagram

```mermaid
flowchart LR
  SG(("Siswa / Guru"))
  KO(("Konselor"))
  PS(("Psikolog"))
  SH(("School Head"))
  NU(("School Nurse"))
  AD(("Admin"))
  SYS(("System"))

  UC0["Isi buku tamu & pilih jadwal via QR"]
  UC1["Isi ketersediaan jadwal"]
  UC2["Lihat janji temu"]
  UC3["Isi Hasil Sesi"]
  UC4["Buat rujukan psikolog"]
  UC5["Isi hasil Puspaga"]
  UC6["Terima & layani sesi psikolog"]
  UC7["Setujui / Tolak rujukan"]
  UC8["Pantau kasus & audit"]
  UC9["Tangani insiden medis"]
  UC10["Kelola user / role / permission"]
  UC11["RTBF scrub PII"]
  UC12["Kirim notifikasi WAHA"]
  UC13["Generate AI insight"]
  UC14["Audit log"]
  UC15["Kelola quisioner (admin)"]
  UC16["Isi quisioner (siswa/guru)"]
  UC17["Edit phone number siswa (admin IT)"]

  SG --> UC0
  KO --> UC1 & UC2 & UC3 & UC4 & UC5 & UC16
  PS --> UC6
  SH --> UC7 & UC8
  NU --> UC9 & UC5
  AD --> UC10 & UC11 & UC12 & UC15 & UC17
  SYS --> UC13 & UC14

  UC0 --> UC12
  UC4 --> UC7
  UC7 --> UC6
  UC4 --> UC5
```

### 🔄 Data Flow Diagram (DFD)

**Level 0 — Context**

```mermaid
flowchart LR
  SG["Siswa / Guru"] -->|"QR booking"| SYS["SWIMS-HBICS"]
  KO["Konselor"] -->|"kelola sesi & rujukan"| SYS
  SH["School Head"] -->|"approve rujukan"| SYS
  PS["Psikolog"] -->|"hasil sesi"| SYS
  NU["Nurse"] -->|"hasil Puspaga"| SYS
  AD["Admin"] -->|"manage"| SYS
  SYS -->|"notifikasi & AI insight"| SG & KO & SH & PS
  SYS -->|"audit"| AD
```

**Level 1 — Counseling / Referral Flow**

```mermaid
flowchart TD
  SG["Siswa / Guru"] -->|"scan QR, isi data + NIK"| P1["P1 Public QR Booking"]
  KO["Konselor"] -->|"availability, notes, rujukan"| P2["P2 Counseling Management"]
  SH["School Head"] -->|"approve / reject"| P3["P3 Referral Approval"]
  PS["Psikolog"] -->|"session result"| P4["P4 Psychologist Session"]
  NU["Nurse"] -->|"puspaga result"| P5["P5 External Puspaga"]

  P1 --> D1[("Appointments")]
  P2 --> D1
  P2 --> D2[("Availability Slots")]
  P2 --> D3[("Psychologist Referrals")]
  P3 --> D3
  P3 -->|"flip status -> awaiting_psychologist_availability"| D1
  P4 --> D1
  P5 --> D3

  D3 --> P3
  D1 --> P2
  P3 -->|"notify"| PS
  P2 -->|"notify"| SH
  P1 -->|"notify counselor"| KO
```

### 🔗 Entity Relationship Diagram (ERD)

```mermaid
erDiagram
  tenants ||--o{ users : "has"
  tenants ||--o{ students : "has"
  tenants ||--o{ appointments : "has"
  tenants ||--o{ availability_slots : "has"
  tenants ||--o{ psychologist_referrals : "has"
  tenants ||--o{ cases : "has"
  tenants ||--o{ incidents : "has"
  tenants ||--o{ quisioners : "has"

  users ||--o{ appointments : "counselor_id"
  users ||--o{ appointments : "psychologist_id"
  users ||--o{ appointments : "school_nurse_id"
  users ||--o{ appointments : "created_by"
  users ||--o{ students : "created_for / guardian"
  users ||--o{ psychologist_referrals : "recommended_by"
  users ||--o{ psychologist_referrals : "leader_id"
  users ||--o{ availability_slots : "professional_id"

  students {
    uuid student_id PK
    string national_id UK
    string full_name
    string gender
    string phone_number "WAHA notification target"
    jsonb metadata
    string tenant_id FK
    timestamp created_at
    timestamp deleted_at
  }
  appointments ||--o{ students : "student_id"
  appointments ||--o{ psychologist_referrals : "appointment_id"
  appointments ||--o| availability_slots : "appointment_id"
```

> Core entities shown; all tables carry `tenant_id` for multi-tenancy. `psychologist_referrals` is the Fase-2 referral table (counselor → School Head approval → internal psychologist / external Puspaga).

### 🏛 Architecture Layer Diagram

```mermaid
flowchart TB
  subgraph PL["Presentation Layer"]
    FE["Next.js 16 App Router + React 19"]
    UI["Tailwind + Base UI / Shadcn + Zustand"]
    PUB["Public QR Booking Pages"]
  end
  subgraph AL["API / BFF Layer"]
    AC["apiClient (fetch wrapper)"]
    AUTH["JWT Auth + Helmet / CORS"]
  end
  subgraph SL["Service Layer - Express"]
    RT["Routes"]
    MW["Middleware: tenant + RBAC/ABAC"]
    SV["Services: appointments, referrals, cases, counseling, quisioner"]
    SH["shared: types, schemas, permission matrix"]
  end
  subgraph DL["Data Layer"]
    PG[("PostgreSQL 16 + PgBouncer")]
    RD[("Redis 7")]
    S3[("MinIO (S3 Media)")]
  end

  PL --> AL
  AL -->|"HTTPS /api"| SL
  SL -->|"pg"| PG
  SL -->|"ioredis"| RD
  SL -->|"AWS S3 SDK"| S3
  MW -->|"app.tenant_id RLS"| PG
```

### 🏗 Construction / Running the Application

SWIMS is a monorepo with three workspaces: `frontend` (Next.js), `backend` (Express + tsx), and `shared` (TypeScript types, Zod schemas, permission matrix consumed by both sides).

**Local development**
```bash
# root
npm install                 # installs all workspaces
cp .env.example .env        # fill DB / JWT / S3 secrets (root .env is used by backend)
# build shared first (frontend & backend import @swims/shared -> dist/)
cd shared && npm run build && cd ..

# terminals
cd backend  && npm run dev          # tsx watch src/server.ts (auto-runs migrate on start)
cd frontend && npm run dev          # next dev
```

**Docker (recommended)**
```bash
# 1) prune old images/build cache (keeps volumes)
sudo docker system prune -a -f
sudo docker builder prune -f

# 2) build shared dist, then compose up (frontend = prod build, backend = dev + auto migrate)
cd shared && npm run build && cd ..
docker compose up -d --build
```
- `swims_backend` runs `npm run migrate && npm run dev:backend` on start (migrations auto-applied).
- `swims_frontend` is a baked production `next start` image (no source bind-mount).
- Services: postgres (5432), pgbouncer (6432), redis (6379), minio (9000/9001).

**Scripts**
```bash
cd backend
npm run migrate     # apply SQL migrations
npm run seed        # seed tenants / roles / demo users
npm run test        # vitest + supertest
npm run typecheck   # tsc --noEmit
```

## 📄 License
This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.
