import { z } from 'zod';

// ─── Auth Schemas ────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant_slug: z.string().min(1),
  captcha_id: z.string().min(1),
  captcha_answer: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1).optional(),
});

// ─── Case Schemas ────────────────────────────────────────────────────────────────

export const createCaseSchema = z.object({
  student_id: z.string().uuid(),
  case_type: z.string().min(1),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assigned_counselor: z.string().uuid().optional(),
  summary: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateCaseSchema = z.object({
  status: z.enum(['OPEN', 'MONITORING', 'CLOSED']).optional(),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  risk_level_source: z.enum(['AUTO', 'MANUAL']).optional(),
  assigned_counselor: z.string().uuid().nullable().optional(),
  summary: z.string().nullable().optional(),
  closed_date: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── Case Share Schemas ─────────────────────────────────────────────────────────

export const shareCaseSchema = z.object({
  shared_with: z.array(z.string().uuid()).min(1).max(20),
  permission: z.enum(['VIEW', 'CONTRIBUTE']).optional(),
});

// ─── Communication Schemas ───────────────────────────────────────────────────────

export const createCommunicationSchema = z.object({
  message: z.string().min(1),
  channel: z.enum(['PHONE', 'EMAIL', 'IN_PERSON', 'APP', 'INTERNAL']).optional(),
  contact_name: z.string().min(1),
  contact_role: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

// ─── User Schemas ────────────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['STUDENT', 'TEACHER', 'COUNSELOR', 'SCHOOL_HEAD', 'SCHOOL_NURSE', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN', 'SUBSTITUTE_TEACHER']),
  national_id: z.string().optional(),
  password: z.string().min(8).optional(),
});

export const bulkCreateUsersSchema = z.object({
  users: z.array(createUserSchema).min(1).max(1000),
});

export const updateUserSchema = z.object({
  full_name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['STUDENT', 'TEACHER', 'COUNSELOR', 'SCHOOL_HEAD', 'SCHOOL_NURSE', 'BOARD_MEMBER', 'CASE_REVIEWER', 'IT_ADMIN', 'SUBSTITUTE_TEACHER']).optional(),
  national_id: z.string().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// ─── RTBF Schema ───────────────────────────────────────────────────────────────

export const rtbfRequestSchema = z.object({
  student_id: z.string().uuid(),
});
