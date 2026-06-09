import { CLUSTER_MODES } from '@venue-pos/shared';
import { lanFetch } from './lan-fetch.js';

export async function proxyToLeader(leaderHost, path, { lanPort, lanSecret, ...options } = {}) {
  return lanFetch(leaderHost, path, { lanPort, lanSecret, ...options });
}

export async function proxyToCoordinator(ctx, path, options = {}) {
  const cluster = ctx.getClusterState?.() ?? {};
  const host =
    cluster.mode === CLUSTER_MODES.FOLLOWER && cluster.leaderHost
      ? cluster.leaderHost
      : ctx.coordinatorLanHost;
  if (!host) throw new Error('No LAN leader/coordinator host configured');
  return lanFetch(host, path, {
    lanPort: ctx.lanPort ?? 3456,
    lanSecret: ctx.lanSecret ?? '',
    ...options,
  });
}

/** @deprecated use proxyToCoordinator */
export async function proxyToCoordinatorLegacy(coordinatorLanHost, path, options = {}) {
  return lanFetch(coordinatorLanHost, path, { lanPort: 3456, ...options });
}
