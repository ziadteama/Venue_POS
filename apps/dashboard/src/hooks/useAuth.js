import { useState, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function useAuth() {
  const [user, setUser] = useState(() => {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => sessionStorage.getItem('token'));

  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? 'Login failed');
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

  return { user, token, login, logout };
}
