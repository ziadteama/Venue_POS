import { normalizeLoopbackUrl } from './cloud-health.js';

/**
 * fetch() does not throw on 4xx/5xx — always check res.ok before treating as success.
 */
export function parseUpstreamError(text, fallbackMessage = 'Request failed') {
  if (!text) return fallbackMessage;
  try {
    const json = JSON.parse(text);
    if (json.error?.message) return json.error.message;
    if (typeof json.message === 'string' && !json.message.startsWith('API /api/')) {
      return json.message;
    }
  } catch {
    // not JSON — use raw text when short enough
    if (text.length < 200 && !text.startsWith('API /api/')) return text;
  }
  return fallbackMessage;
}

export async function apiFetch(apiUrl, terminalId, terminalSecret, path, options = {}) {
  const base = normalizeLoopbackUrl(apiUrl).replace(/\/$/, '');
  const method = options.method ?? 'GET';
  const needsBody = method !== 'GET' && method !== 'HEAD' && options.body == null;
  const res = await fetch(`${base}${path}`, {
    ...options,
    ...(needsBody ? { body: '{}' } : {}),
    headers: {
      'content-type': 'application/json',
      'x-terminal-id': terminalId,
      'x-terminal-secret': terminalSecret,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`API ${path} failed (${res.status}): ${text}`);
    err.statusCode = res.status;
    err.responseText = text;
    err.apiMessage = parseUpstreamError(text, err.message);
    throw err;
  }

  return res.status === 204 ? null : res.json();
}

/** Map upstream API errors to the same status/body for POS (avoids opaque 500s). */
export function sendApiError(reply, err) {
  if (!err?.statusCode) throw err;
  try {
    return reply.status(err.statusCode).send(JSON.parse(err.responseText));
  } catch {
    return reply.status(err.statusCode).send({
      error: {
        message: err.apiMessage ?? parseUpstreamError(err.responseText, err.message),
      },
    });
  }
}
