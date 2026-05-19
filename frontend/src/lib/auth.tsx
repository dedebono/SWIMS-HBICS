'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStoredUser, setStoredUser, setTokens, clearTokens, apiClient } from './api-client';

interface User {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  tenant_id: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, tenantSlug: string, captchaId: string, captchaAnswer: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string, tenantSlug: string, captchaId: string, captchaAnswer: string): Promise<User> => {
    const res = await apiClient<{
      access_token: string;
      refresh_token: string;
      user: User;
    }>('/auth/login', {
      method: 'POST',
      body: { email, password, tenant_slug: tenantSlug, captcha_id: captchaId, captcha_answer: captchaAnswer },
    });

    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Login failed');
    }

    setTokens(res.data.access_token, res.data.refresh_token);
    setStoredUser(res.data.user);
    setUser(res.data.user);
    
    return res.data.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors during logout
    }
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
