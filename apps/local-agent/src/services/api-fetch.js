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
    throw new Error(`API ${path} failed (${res.status}): ${text}`);
  }

  return res.status === 204 ? null : res.json();
}
