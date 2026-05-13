const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('swims_access_token');
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('swims_access_token', accessToken);
  localStorage.setItem('swims_refresh_token', refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem('swims_access_token');
  localStorage.removeItem('swims_refresh_token');
  localStorage.removeItem('swims_user');
}

export function getStoredUser(): { user_id: string; full_name: string; email: string; role: string; tenant_id: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('swims_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { user_id: string; full_name: string; email: string; role: string; tenant_id: string };
  } catch {
    return null;
  }
}

export function setStoredUser(user: { user_id: string; full_name: string; email: string; role: string; tenant_id: string }): void {
  localStorage.setItem('swims_user', JSON.stringify(user));
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem('swims_refresh_token');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json() as ApiResponse<{ access_token: string; refresh_token: string }>;
    if (data.success && data.data) {
      setTokens(data.data.access_token, data.data.refresh_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function apiClient<T>(path: string, options: FetchOptions = {}): Promise<ApiResponse<T>> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // If 401, try refreshing token
  if (res.status === 401 && token) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      const newToken = getAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } else {
      clearTokens();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }

  return res.json() as Promise<ApiResponse<T>>;
}
