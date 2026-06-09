import { CLUSTER_MODES } from '@venue-pos/shared';
import { apiFetch } from './api-fetch.js';
import { isCloudOnline } from './cloud-health.js';
import { occupyFloorLock, releaseFloorLock } from './floor-locks.js';
import { lanFetch } from './lan-fetch.js';
import { relayFloorAction } from './relay-client.js';

function getCluster(ctx) {
  return ctx.getClusterState?.() ?? {};
}

function getLanOpts(ctx) {
  return {
    lanPort: ctx.lanPort ?? 3456,
    lanSecret: ctx.lanSecret ?? '',
  };
}

async function leaderFetch(leaderHost, path, ctx, options = {}) {
  return lanFetch(leaderHost, path, { ...getLanOpts(ctx), ...options });
}

/** Occupy hub floor table via cloud API, relay peer, or LAN leader. */
export async function occupyFloorUpstream(ctx, { tableLabel, chequeId, venueId }) {
  const { db, apiUrl, terminalId, terminalSecret } = ctx;
  const cluster = getCluster(ctx);

  if (cluster.mode === CLUSTER_MODES.LEADER || ctx.isCoordinator) {
    return occupyFloorLock(db, { tableLabel, chequeId, terminalId, venueId });
  }

  if (cluster.mode === CLUSTER_MODES.FOLLOWER && cluster.leaderHost) {
    return leaderFetch(cluster.leaderHost, '/v1/floor/tables/occupy', ctx, {
      method: 'POST',
      body: { tableLabel, chequeId, terminalId, venueId },
    });
  }

  if (cluster.mode === CLUSTER_MODES.RELAY && cluster.relayHost) {
    return relayFloorAction({
      relayHost: cluster.relayHost,
      ...getLanOpts(ctx),
      terminalId,
      terminalSecret,
      action: 'occupy',
      body: { tableLabel, chequeId },
    });
  }

  if (isCloudOnline()) {
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables/occupy', {
      method: 'POST',
      body: JSON.stringify({ tableLabel, chequeId }),
    });
  }

  if (ctx.coordinatorFallback && ctx.coordinatorLanHost) {
    return leaderFetch(ctx.coordinatorLanHost, '/v1/floor/tables/occupy', ctx, {
      method: 'POST',
      body: { tableLabel, chequeId, terminalId, venueId },
    });
  }

  return null;
}

export async function releaseFloorUpstream(ctx, { tableLabel, chequeId }) {
  const { db, apiUrl, terminalId, terminalSecret } = ctx;
  const cluster = getCluster(ctx);

  if (cluster.mode === CLUSTER_MODES.LEADER || ctx.isCoordinator) {
    return releaseFloorLock(db, { tableLabel, chequeId });
  }

  if (cluster.mode === CLUSTER_MODES.FOLLOWER && cluster.leaderHost) {
    return leaderFetch(cluster.leaderHost, '/v1/floor/tables/release', ctx, {
      method: 'POST',
      body: { tableLabel, chequeId },
    });
  }

  if (cluster.mode === CLUSTER_MODES.RELAY && cluster.relayHost) {
    return relayFloorAction({
      relayHost: cluster.relayHost,
      ...getLanOpts(ctx),
      terminalId,
      terminalSecret,
      action: 'release',
      body: { tableLabel, chequeId },
    });
  }

  if (isCloudOnline()) {
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables/release', {
      method: 'POST',
      body: JSON.stringify({ tableLabel, chequeId }),
    });
  }

  if (ctx.coordinatorFallback && ctx.coordinatorLanHost) {
    return leaderFetch(ctx.coordinatorLanHost, '/v1/floor/tables/release', ctx, {
      method: 'POST',
      body: { tableLabel, chequeId },
    });
  }

  return null;
}
