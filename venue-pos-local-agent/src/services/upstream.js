import { apiFetch } from './api-fetch.js';
import { isCloudOnline } from './cloud-health.js';

export async function upstreamFetch(
  { apiUrl, coordinatorUrl, coordinatorFallback, terminalId, terminalSecret },
  path,
  options = {},
) {
  if (isCloudOnline()) {
    return apiFetch(apiUrl, terminalId, terminalSecret, path, options);
  }
  if (coordinatorFallback && coordinatorUrl) {
    const url = coordinatorUrl.replace(/\/$/, '');
    const res = await fetch(`${url}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Coordinator ${path} failed (${res.status}): ${text}`);
      err.statusCode = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  throw new Error('Cloud unreachable and coordinator fallback disabled');
}
