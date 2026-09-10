import { useCallback, useEffect, useState } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export interface AuthUser {
  id: string;
  login: string;
  displayName: string;
  avatar: string;
  color: string;
  isOwner: boolean;
  isAdmin: boolean;
}

const TOKEN_KEY = 'auth_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Pick up token from OAuth redirect
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      window.history.replaceState({}, '', '/');
    }

    setConnectionError(false);
    fetch(`${SERVER_URL}/auth/me`, {
      credentials: 'include',
      headers: authHeaders(),
    })
      .then((r) => {
        if (r.status >= 500) throw new Error(`Authentication server returned ${r.status}`);
        return r.ok ? r.json() : null;
      })
      .then(setUser)
      .catch(() => {
        setUser(null);
        setConnectionError(true);
      })
      .finally(() => setLoading(false));
  }, [retryKey]);

  const login = () => { window.location.href = `${SERVER_URL}/auth/twitch`; };

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    try {
      await fetch(`${SERVER_URL}/auth/logout`, { method: 'POST', credentials: 'include', headers: authHeaders() });
    } catch {
      // The local token is authoritative for the dashboard; server logout is best-effort.
    } finally {
      // Logging out locally must still work while Render is unavailable.
      setUser(null);
    }
  };

  const refreshUser = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/auth/refresh`, { credentials: 'include', headers: authHeaders() });
      if (r.ok) setUser(await r.json());
      else if (r.status >= 500) setConnectionError(true);
    } catch {
      setConnectionError(true);
    }
  }, []);

  const retryConnection = () => {
    setLoading(true);
    setRetryKey((value) => value + 1);
  };

  return { user, loading, login, logout, refreshUser, connectionError, retryConnection };
}
