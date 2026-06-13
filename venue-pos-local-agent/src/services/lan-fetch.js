import { DEFAULT_AGENT_LAN_PORT } from '@venue-pos/shared';

export function buildLanUrl(host, path, lanPort = DEFAULT_AGENT_LAN_PORT) {
  return `http://${host}:${lanPort}${path}`;
}

export async function lanFetch(
  host,
  path,
  { lanPort, lanSecret, method = 'GET', body, headers = {} } = {},
) {
  const url = buildLanUrl(host, path, lanPort);
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(lanSecret ? { 'x-agent-lan-secret': lanSecret } : {}),
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`LAN ${path} failed (${res.status}): ${text}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}
