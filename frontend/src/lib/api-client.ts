const API_BASE = '/api';
const IS_DEV = process.env.NODE_ENV === 'development';

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

export function setTokens(accessToken: string, refreshToken?: string): void {
  localStorage.setItem('swims_access_token', accessToken);
  if (refreshToken) {
    localStorage.setItem('swims_refresh_token', refreshToken); // Deprecated but kept for compatibility
  }
}

export function clearTokens(): void {
  localStorage.removeItem('swims_access_token');
  localStorage.removeItem('swims_refresh_token');
  localStorage.removeItem('swims_user');
}

export function getStoredUser(): { user_id: string; full_name: string; email: string; role: string; tenant_id: string; gender?: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('swims_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { user_id: string; full_name: string; email: string; role: string; tenant_id: string; gender?: string };
  } catch {
    return null;
  }
}

export function setStoredUser(user: { user_id: string; full_name: string; email: string; role: string; tenant_id: string; gender?: string }): void {
  localStorage.setItem('swims_user', JSON.stringify(user));
}

async function refreshTokens(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Send credentials (httpOnly cookie) to allow backend to refresh
      credentials: 'include',
    });

    if (!res.ok) return false;

    const data = await res.json() as ApiResponse<{ access_token: string; refresh_token?: string }>;
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

  const url = `${API_BASE}${path}`;
  if (IS_DEV) {
    console.log(`[apiClient] fetching: ${url}`);
  }

  let res;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'include', // Ensure cookies are sent
    });
  } catch (error) {
    console.error(`[apiClient] Fetch failed completely for ${url}:`, error);
    throw error;
  }

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

  // Handle non-JSON responses (e.g., plain text errors)
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    // Return structured error for non-JSON responses
    return {
      success: false,
      data: null,
      error: text.slice(0, 500) || `HTTP ${res.status}: ${res.statusText}`,
    } as ApiResponse<T>;
  }

  return res.json() as Promise<ApiResponse<T>>;
}
