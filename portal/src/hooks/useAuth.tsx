import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { Me } from '../api/types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const { user } = await api.get<{ user: Me }>('/auth/me');
      setMe(user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else throw err;
    }
  }

  async function signIn(email: string, pin: string) {
    await api.post<{ user: Me }>('/auth/verify', { email, pin });
    await refresh();
  }

  async function signOut() {
    await api.post('/auth/logout');
    setMe(null);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return <Ctx.Provider value={{ me, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
