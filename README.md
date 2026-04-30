# SWIMS (Student Wellbeing and Incident Management System)

SWIMS is a comprehensive, multi-tenant SaaS platform designed to help schools and educational institutions monitor student wellbeing, manage disciplinary and medical cases, track interventions, and generate advanced analytics. 

Built with modern web technologies, SWIMS features a robust Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC) system, ensuring data privacy and security across various user roles (e.g., Counselors, Teachers, IT Admins, School Heads, Nurses, etc.).

## 🚀 Key Features

- **Multi-Tenant SaaS Architecture**: Scalable architecture to support multiple schools/districts within a single deployment.
- **Granular Access Control**: Advanced RBAC and ABAC ensuring data minimization, privacy, and contextual access (e.g., Teachers only see their assigned students, Nurses only handle medical incidents).
- **Incident & Case Management**: Complete lifecycle tracking for behavioral and medical incidents, case escalations, and interventions.
- **Positive Observations**: Dedicated tracking for positive reinforcement and student achievements.
- **AI-Powered Insights**: Integrated AI analysis (powered by Ollama/Local LLMs) to detect patterns, evaluate intervention efficacy, and summarize student records.
- **Secure Media Assets**: AWS S3/Firebase integrated secure file handling, redaction support, and presigned uploads for sensitive evidence tracking.
- **Right to Be Forgotten (RTBF)**: Compliance with data privacy regulations (GDPR/FERPA) allowing IT Admins to securely scrub PII.
- **Comprehensive Audit Logging**: Immutable audit trails for all sensitive data access and system modifications.

## 🛠 Tech Stack

### Frontend
- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Styling**: Tailwind CSS
- **State Management & Data Fetching**: React Query, Axios
- **UI Components**: Shadcn UI / Radix primitives

### Backend
- **Runtime**: [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/)
- **Language**: TypeScript
- **Database**: PostgreSQL (with `pg` connection pooling)
- **Validation**: Zod
- **Authentication**: JWT & Firebase Auth (for SSO integrations)
- **Testing**: Vitest, Supertest
- **AI**: Ollama integration for on-premise/local LLM insights

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
   npm run db:migrate
   npm run db:seed
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

## 📄 License
This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.
