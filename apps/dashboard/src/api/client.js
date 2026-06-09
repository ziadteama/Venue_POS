import { parseApiError } from '../utils/apiError.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let onAuthInvalid = null;
let sessionInvalidated = false;

export function getToken() {
  return sessionStorage.getItem('token');
}

export function setAuthInvalidHandler(handler) {
  onAuthInvalid = handler;
}

export function resetAuthSession() {
  sessionInvalidated = false;
}

function authHeaders(token = getToken()) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function isAuthFailure(statusOrMessage) {
  if (statusOrMessage === 401) return true;
  const msg = String(statusOrMessage ?? '').toLowerCase();
  return (
    msg.includes('unauthorized') ||
    msg.includes('expired') ||
    msg.includes('jwt') ||
    (msg.includes('invalid') && msg.includes('token')) ||
    msg.includes('missing token')
  );
}

export function invalidateAuthSession() {
  if (onAuthInvalid && !sessionInvalidated) {
    sessionInvalidated = true;
    onAuthInvalid();
  }
}

function maybeInvalidateAuth(res) {
  if (res.status === 401) invalidateAuthSession();
}

function readApiError(data, fallback = 'Request failed') {
  return parseApiError(data?.error?.message ?? data?.message ?? data, fallback);
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
      ...authHeaders(token),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  maybeInvalidateAuth(res);
  if (!res.ok) throw new Error(readApiError(data, 'Request failed'));
  return data;
}

export async function apiFetchBlob(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...options.headers,
    },
  });
  maybeInvalidateAuth(res);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(readApiError(data, 'Request failed'));
  }
  return res.blob();
}

export { API_URL };
