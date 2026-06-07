/**
 * fetch() does not throw on 4xx/5xx — always check res.ok before treating as success.
 */
export async function apiFetch(apiUrl, terminalId, terminalSecret, path, options = {}) {
  const method = options.method ?? 'GET';
  const needsBody = method !== 'GET' && method !== 'HEAD' && options.body == null;
  const res = await fetch(`${apiUrl}${path}`, {
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
      error: { message: err.responseText || err.message },
    });
  }
}
