import { apiFetch } from './api-fetch.js';
import { isCloudOnline } from './cloud-health.js';
import { occupyFloorLock, releaseFloorLock } from './floor-locks.js';

async function coordinatorFetch(coordinatorLanHost, path, options = {}) {
  const url = `http://${coordinatorLanHost}:3456${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Coordinator ${path} failed (${res.status}): ${text}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Occupy hub floor table via cloud API or LAN coordinator. */
export async function occupyFloorUpstream(
  ctx,
  { tableLabel, chequeId, venueId },
) {
  const { db, apiUrl, terminalId, terminalSecret, isCoordinator, coordinatorLanHost, coordinatorFallback } =
    ctx;

  if (isCoordinator || (isCloudOnline() === false && coordinatorFallback && coordinatorLanHost)) {
    if (isCoordinator) {
      return occupyFloorLock(db, { tableLabel, chequeId, terminalId, venueId });
    }
    return coordinatorFetch(coordinatorLanHost, '/v1/floor/tables/occupy', {
      method: 'POST',
      body: JSON.stringify({ tableLabel, chequeId, terminalId, venueId }),
    });
  }

  if (isCloudOnline()) {
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables/occupy', {
      method: 'POST',
      body: JSON.stringify({ tableLabel, chequeId }),
    });
  }

  return null;
}

export async function releaseFloorUpstream(ctx, { tableLabel, chequeId }) {
  const { db, apiUrl, terminalId, terminalSecret, isCoordinator, coordinatorLanHost, coordinatorFallback } =
    ctx;

  if (isCoordinator || (isCloudOnline() === false && coordinatorFallback && coordinatorLanHost)) {
    if (isCoordinator) {
      return releaseFloorLock(db, { tableLabel, chequeId });
    }
    return coordinatorFetch(coordinatorLanHost, '/v1/floor/tables/release', {
      method: 'POST',
      body: JSON.stringify({ tableLabel, chequeId }),
    });
  }

  if (isCloudOnline()) {
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables/release', {
      method: 'POST',
      body: JSON.stringify({ tableLabel, chequeId }),
    });
  }

  return null;
}
