import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL, assertApiConfigured, resetAuthSession, setAuthInvalidHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => sessionStorage.getItem('token'));

  const login = useCallback(async (username, password) => {
    assertApiConfigured();

    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const raw = await res.text();
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          res.status === 405
            ? 'Login blocked (405). Set VITE_API_URL to your Render API host in Vercel, not the dashboard URL.'
            : 'Unexpected response from API. Check VITE_API_URL and that Render is running.',
        );
      }
    } else if (!res.ok) {
      throw new Error(
        res.status === 405
          ? 'Login blocked (405). Set VITE_API_URL to your Render API host in Vercel, not the dashboard URL.'
          : `Login failed (${res.status})`,
      );
    }
    if (!res.ok) throw new Error(data.error?.message ?? 'Login failed');
    resetAuthSession();
    sessionStorage.setItem('token', data.accessToken);
    sessionStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setAuthInvalidHandler(logout);
    return () => setAuthInvalidHandler(null);
  }, [logout]);

  return createElement(
    AuthContext.Provider,
    { value: { user, token, login, logout } },
    children,
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
