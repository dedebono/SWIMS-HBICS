// ─── Consistent API Response Envelope ────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: ApiMeta;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  cursor?: string;
  hasMore?: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: ApiMeta & {
    total: number;
    hasMore: boolean;
  };
}

// ─── Timeline Event Types ────────────────────────────────────────────────────

export type TimelineEventType = 'INCIDENT' | 'INTERVENTION' | 'OBSERVATION' | 'CASE_STATUS_CHANGE';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  date: string;
  category: string;
  severity?: string;
  description: string;
  reported_by_name?: string;
  case_id?: string;
  relevance_weight: number;
  metadata?: Record<string, unknown>;
}

// ─── Student Progress Types ──────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface StudentProgress {
  has_data: boolean;
  cases: {
    total: number;
    open: number;
    monitoring: number;
    closed: number;
    closure_rate: number; // 0..1 (closed / total)
  };
  interventions: {
    total: number;
    completed: number;
    scheduled: number;
    completion_rate: number; // 0..1 (completed / total)
  };
  incidents: { total: number };
  observations: { total: number };
  risk_level: RiskLevel | null;
  progress_percentage: number; // 0..100 derived overall
}

export interface StudentProfileTimelineItem {
  date: string;
  type: string;
  status: string;
  handled_by: string;
}

export interface StudentProfile {
  student_id: string;
  full_name: string;
  national_id: string | null;
  enrollment: {
    class_name: string | null;
    academic_year: string | null;
  };
  summary: {
    total_active_cases: number;
    total_incidents: number;
    risk_level: RiskLevel;
    positive_count: number;
    last_incident_date: string | null;
  };
  timeline: StudentProfileTimelineItem[];
}

// ─── Student Cases Types ────────────────────────────────────────────────────

export type CaseType = 'BEHAVIORAL' | 'EMOTIONAL' | 'MEDICAL' | 'ACADEMIC' | 'POSITIVE';
export type CaseStatus = 'OPEN' | 'MONITORING' | 'CLOSED';

export interface StudentCaseSummary {
  case_id: string;
  case_type: CaseType;
  status: CaseStatus;
  risk_level: RiskLevel;
  opened_date: string | null;
  closed_date: string | null;
  summary: string | null;
  assigned_counselor_name: string | null;
  incident_count: number;
  intervention_count: number;
  latest_incident_at: string | null;
}

// ─── Auth Types ──────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
  tenant_slug: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    tenant_id: string;
  };
}

export interface JwtPayload {
  user_id: string;
  tenant_id: string;
  role: string;
  iat: number;
  exp: number;
}
