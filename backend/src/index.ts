import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.middleware.js';
import { closePool } from './db/pool.js';
import { initCronJobs } from './jobs/cron.js';

// Route imports
import authRoutes from './api/auth.routes.js';
import casesRoutes from './api/cases.routes.js';
import incidentsRoutes from './api/incidents.routes.js';
import studentsRoutes from './api/students.routes.js';
import auditLogsRoutes from './api/audit-logs.routes.js';
import mediaRoutes from './api/media.routes.js';
import alertsRoutes from './api/alerts.routes.js';
import interventionsRoutes from './api/interventions.routes.js';
import consentsRoutes from './api/consents.routes.js';
import communicationsRoutes from './api/communications.routes.js';
import caseSharesRoutes, { teacherRouter } from './api/case-shares.routes.js';
import guidebookRoutes from './api/guidebook.routes.js';
import counselorRoutes from './api/counselor.routes.js';
import adminRoutes from './api/admin.routes.js';
import analyticsRoutes from './api/analytics.routes.js';
import observationsRoutes from './api/positive-observations.routes.js';
import reportsRoutes from './api/reports.routes.js';
import onboardingRoutes from './api/onboarding.routes.js';
import adminSettingsRoutes from './api/admin-settings.routes.js';
import insightsRoutes from './api/insights.routes.js';
import disciplineHandbookRoutes from './api/discipline-handbook.routes.js';
import quisionerRoutes from './api/quisioner.routes.js';
import appointmentsRoutes from './api/appointments.routes.js';
import availabilityRoutes from './api/availability.routes.js';
import referralsRoutes from './api/referrals.routes.js';
import staffQuisionerRoutes from './api/staff-quisioner.routes.js';
import counselingBookingRoutes from './api/counseling-booking.routes.js';
import employeeCounselingRoutes from './api/employee-counseling.routes.js';
const app = express();

// ─── Global Middleware ───────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('short'));

// Trust proxy for accurate IP in rate limiting
app.set('trust proxy', 1);

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ──────────────────────────────────────────────────────────────

// Public Routes
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Protected Routes
app.use('/api/cases', casesRoutes);
app.use('/api/cases', caseSharesRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/counselor', counselorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminSettingsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/guidebook', guidebookRoutes);
app.use('/api/discipline-handbook', disciplineHandbookRoutes);
app.use('/api', staffQuisionerRoutes);
app.use('/api', counselingBookingRoutes);
app.use('/api', employeeCounselingRoutes);
app.use('/api/quisioner', quisionerRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/referrals', referralsRoutes);

// Protected Root-Level Routers
app.use('/api', incidentsRoutes);
app.use('/api', interventionsRoutes);
app.use('/api', consentsRoutes);
app.use('/api', communicationsRoutes);
app.use('/api', observationsRoutes);
app.use('/api', insightsRoutes);
app.use('/api', teacherRouter);

// ─── Error Handler (must be last) ───────────────────────────────────────────

app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────────────

export { app };
