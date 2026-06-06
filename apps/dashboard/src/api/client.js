const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function getToken() {
  return sessionStorage.getItem('token');
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const method = options.method ?? 'GET';
  const needsBody = method !== 'GET' && method !== 'HEAD' && options.body == null;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    ...(needsBody ? { body: '{}' } : {}),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message ?? 'Request failed');
  return data;
}
