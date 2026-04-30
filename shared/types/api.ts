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
