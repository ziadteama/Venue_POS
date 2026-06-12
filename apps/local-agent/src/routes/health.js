import { getCachedMenu } from '../services/menu-sync.js';
import { getPrinterHealth } from '../services/kitchen-printer.js';
import {
  getReceiptPrinterHealth,
  isCashDrawerEnabled,
  probeReceiptPrinterHealth,
} from '../services/receipt-printer.js';
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

function countStaffRole(db, role) {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM staff_cache WHERE role = ?`)
    .get(role);
  return Number(row?.c ?? 0);
}

export function registerHealthRoutes(
  app,
  {
    db,
    apiUrl,
    terminalId,
    terminalSecret,
    venueId,
    isCoordinator,
    coordinatorMode,
    getCoordinatorLanHost,
    coordinatorFallback,
    clusterManager,
    getDeviceProfile,
    getPrinterConfig,
  },
) {
  const clusterState = () => clusterManager?.getState?.() ?? {};
  const peerList = () => clusterManager?.getPeerList?.() ?? [];
  const coordinatorHost = () => getCoordinatorLanHost?.() ?? '';

  function buildClusterLabels(cluster) {
    const peers = peerList();
    return {
      relayPeerLabel: findPeerLabel(peers, {
        terminalId: cluster.relayTerminalId,
        host: cluster.relayHost,
      }),
      leaderPeerLabel: findPeerLabel(peers, {
        terminalId: cluster.leaderId,
        host: cluster.leaderHost ?? coordinatorHost(),
      }),
    };
  }

  app.get('/health', async () => {
    const cluster = clusterState();
    const deviceProfile = getDeviceProfile?.() ?? {};
    const labels = buildClusterLabels(cluster);
    const printers = getPrinterConfig?.() ?? {};
    await probeReceiptPrinterHealth({
      host: printers.receiptPrinterHost,
      port: printers.receiptPrinterPort,
    });
    const provisioned = Boolean(terminalId && terminalSecret && apiUrl);
    const staffCount = db.prepare(`SELECT COUNT(*) AS c FROM staff_cache`).get()?.c ?? 0;
    return {
      status: 'ok',
      service: 'local-agent',
      provisioned,
      hasStaffCache: Number(staffCount) > 0,
      hasManagerCache: countStaffRole(db, 'venue_manager') > 0,
      hasKioskExitPin: Boolean(getAgentMeta(db, 'kiosk_exit_pin_hash')),
      deviceLabel: deviceProfile.deviceLabel ?? null,
      deviceProfile,
      syncQueueDepth: getSyncQueueDepth(db),
      syncFailedCount: getFailedSyncCount(db),
      syncProgress: getSyncProgress(db),
      menuCached: Boolean(getCachedMenu(db, venueId)),
      menuStale: getAgentMeta(db, 'menu_stale') === 'true',
      printer: getPrinterHealth(),
      receiptPrinter: getReceiptPrinterHealth(),
      cashDrawerEnabled: isCashDrawerEnabled(),
      cloudOnline: isCloudOnline(),
      isCoordinator,
      coordinatorMode: cluster.mode ?? coordinatorMode,
      coordinatorLanHost: cluster.leaderHost ?? coordinatorHost() ?? null,
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
