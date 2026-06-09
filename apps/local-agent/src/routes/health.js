import { getCachedMenu } from '../services/menu-sync.js';
import { getPrinterHealth } from '../services/kitchen-printer.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  getSyncQueueDepth,
  getFailedSyncCount,
  getSyncProgress,
} from '../services/sync-processor.js';
import { getAgentMeta } from '../services/terminal-cache.js';

function findPeerLabel(peers, { terminalId, host } = {}) {
  const peer = peers.find(
    (p) => (terminalId && p.terminalId === terminalId) || (host && p.host === host),
  );
  return peer?.deviceLabel || peer?.host || null;
}

export function registerHealthRoutes(
  app,
  {
    db,
    venueId,
    isCoordinator,
    coordinatorMode,
    coordinatorLanHost,
    coordinatorFallback,
    clusterManager,
    getDeviceProfile,
  },
) {
  const clusterState = () => clusterManager?.getState?.() ?? {};
  const peerList = () => clusterManager?.getPeerList?.() ?? [];

  function buildClusterLabels(cluster) {
    const peers = peerList();
    return {
      relayPeerLabel: findPeerLabel(peers, {
        terminalId: cluster.relayTerminalId,
        host: cluster.relayHost,
      }),
      leaderPeerLabel: findPeerLabel(peers, {
        terminalId: cluster.leaderId,
        host: cluster.leaderHost ?? coordinatorLanHost,
      }),
    };
  }

  app.get('/health', async () => {
    const cluster = clusterState();
    const deviceProfile = getDeviceProfile?.() ?? {};
    const labels = buildClusterLabels(cluster);
    return {
      status: 'ok',
      service: 'local-agent',
      deviceLabel: deviceProfile.deviceLabel ?? null,
      deviceProfile,
      syncQueueDepth: getSyncQueueDepth(db),
      syncFailedCount: getFailedSyncCount(db),
      syncProgress: getSyncProgress(db),
      menuCached: Boolean(getCachedMenu(db, venueId)),
      menuStale: getAgentMeta(db, 'menu_stale') === 'true',
      printer: getPrinterHealth(),
      cloudOnline: isCloudOnline(),
      isCoordinator,
      coordinatorMode: cluster.mode ?? coordinatorMode,
      coordinatorLanHost: cluster.leaderHost ?? coordinatorLanHost ?? null,
      coordinatorFallback: Boolean(coordinatorFallback),
      clusterMode: cluster.mode ?? 'direct',
      leaderId: cluster.leaderId ?? null,
      relayHost: cluster.relayHost ?? null,
      relayTerminalId: cluster.relayTerminalId ?? null,
      relayPeerLabel: labels.relayPeerLabel,
      leaderPeerLabel: labels.leaderPeerLabel,
      peers: peerList().map((p) => ({
        terminalId: p.terminalId,
        host: p.host ?? null,
        lanPort: p.lanPort ?? null,
        deviceLabel: p.deviceLabel ?? null,
        cloudOnline: Boolean(p.cloudOnline),
        mode: p.mode ?? null,
      })),
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/v1/status', async () => {
    const cluster = clusterState();
    const deviceProfile = getDeviceProfile?.() ?? {};
    const labels = buildClusterLabels(cluster);
    return {
      online: isCloudOnline(),
      sqlite: 'connected',
      venueId,
      deviceLabel: deviceProfile.deviceLabel ?? null,
      isCoordinator: cluster.isLeader ?? isCoordinator,
      coordinatorMode: cluster.mode ?? coordinatorMode,
      clusterMode: cluster.mode ?? 'direct',
      leaderId: cluster.leaderId ?? null,
      leaderPeerLabel: labels.leaderPeerLabel,
      relayHost: cluster.relayHost ?? null,
      relayTerminalId: cluster.relayTerminalId ?? null,
      relayPeerLabel: labels.relayPeerLabel,
      syncQueueDepth: getSyncQueueDepth(db),
      syncFailedCount: getFailedSyncCount(db),
      syncProgress: getSyncProgress(db),
      menuStale: getAgentMeta(db, 'menu_stale') === 'true',
      version: '0.3.0',
    };
  });

  app.get('/v1/sync/progress', async () => getSyncProgress(db));
}
