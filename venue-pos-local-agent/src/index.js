import 'dotenv/config';
import os from 'node:os';
import {
  SYNC_WORKER_INTERVAL_MS,
  MENU_SYNC_WORKER_INTERVAL_MS,
  SYNC_FAILED_RETRY_INTERVAL_MS,
  CHEQUE_HYDRATION_INTERVAL_MS,
  PEER_GOSSIP_INTERVAL_MS,
  TERMINAL_HEARTBEAT_INTERVAL_MS,
  DEFAULT_AGENT_LAN_PORT,
  CLUSTER_MODES,
} from '@venue-pos/shared';
import { createDatabase } from './db/sqlite.js';
import { buildAgentServer } from './server.js';
import { syncMenuFromServer } from './services/menu-sync.js';
import { processSyncQueue, getSyncQueueDepth } from './services/sync-processor.js';
import { connectTerminalSocket } from './services/ws-client.js';
import { startMenuSyncWorker } from './services/menu-sync-worker.js';
import { startSyncRetryWorker } from './services/sync-retry-worker.js';
import {
  syncVenueConfigFromServer,
  resolvePrinterConfig,
} from './services/venue-config-sync.js';
import { probeCloudHealth, setCloudOnline, isCloudOnline, normalizeLoopbackUrl } from './services/cloud-health.js';
import { sendDeviceRegistration } from './services/heartbeat.js';
import { syncTerminalRosterFromServer, setAgentMeta } from './services/terminal-cache.js';
import { runReconnectHandshake } from './services/reconnect.js';
import { hydrateOpenCheques } from './services/cheque-hydration.js';
import { createClusterManager, attachQueueDepth } from './services/cluster-manager.js';
import {
  buildDeviceProfile,
  resolveDeviceLabel,
  setLocalDeviceLabel,
} from './services/device-profile.js';
import { applyHubLanConfig } from './services/lan-config.js';
import { probeReceiptPrinterHealth } from './services/receipt-printer.js';

const port = Number(process.env.PORT ?? DEFAULT_AGENT_LAN_PORT);
const host = process.env.HOST ?? '127.0.0.1';
const lanPort = Number(process.env.AGENT_LAN_PORT ?? port);
const lanSecret = process.env.AGENT_LAN_SECRET ?? '';
const dbPath = process.env.SQLITE_PATH ?? './data/local.db';
const apiUrl = normalizeLoopbackUrl(process.env.SERVER_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const cloudHealthUrl = normalizeLoopbackUrl(
  process.env.CLOUD_HEALTH_URL ?? `${apiUrl}/health`,
);
const venueId = process.env.VENUE_ID ?? '';
const terminalId = process.env.TERMINAL_ID ?? '';
const terminalSecret = process.env.TERMINAL_SECRET ?? '';
const agentPriority = Number(process.env.AGENT_PRIORITY ?? 50);
const agentPeers = (process.env.AGENT_PEERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const coordinatorTerminalId = process.env.COORDINATOR_TERMINAL_ID ?? '';
const coordinatorLanHost = process.env.COORDINATOR_LAN_HOST ?? '';
const coordinatorFallback = process.env.COORDINATOR_FALLBACK_ENABLED === 'true';
const isCoordinator =
  process.env.IS_COORDINATOR === 'true' ||
  (coordinatorTerminalId && coordinatorTerminalId === terminalId);
const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5174').split(',');
const kitchenPrinterHost = process.env.KITCHEN_PRINTER_HOST ?? '';
const kitchenPrinterPort = Number(process.env.KITCHEN_PRINTER_PORT ?? 9100);
const autoReceiptPrint = process.env.FEATURE_AUTO_RECEIPT_PRINT !== 'false';
const agentDeviceLabel = process.env.AGENT_DEVICE_LABEL ?? '';
const advertiseHost = process.env.AGENT_LAN_HOST ?? pickLanAddress();
const coordinatorRuntime = { host: coordinatorLanHost };

function getCoordinatorLanHost() {
  return coordinatorRuntime.host?.trim() || coordinatorLanHost?.trim() || '';
}

function syncHubLanConfig() {
  return applyHubLanConfig({
    db,
    clusterManager,
    envPeers: agentPeers,
    envCoordinatorHost: coordinatorLanHost,
    ownLanHost: advertiseHost,
    coordinatorRuntime,
  });
}

function pickLanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

const db = createDatabase(dbPath);
if (agentDeviceLabel) setLocalDeviceLabel(db, agentDeviceLabel);
const envPrinterDefaults = {
  kitchenPrinterHost,
  kitchenPrinterPort,
};

const clusterManager = createClusterManager({
  terminalId,
  agentPriority,
  lanPort,
  lanSecret,
  forcedLeaderTerminalId: coordinatorTerminalId,
  forcedLeaderHost: coordinatorLanHost,
  isForcedLeader: isCoordinator,
  staticPeerHosts: agentPeers,
  getOwnLanHost: () => advertiseHost,
  getLanPort: () => lanPort,
  getDeviceLabel: () => resolveDeviceLabel(db, { envLabel: agentDeviceLabel, terminalId }),
});
attachQueueDepth(clusterManager, db);

function buildHeartbeatProfile() {
  const cluster = getClusterState();
  return buildDeviceProfile({
    db,
    terminalId,
    lanHost: advertiseHost,
    lanPort,
    agentPriority,
    clusterMode: cluster.mode,
    envLabel: agentDeviceLabel,
    syncQueueDepth: getSyncQueueDepth(db),
  });
}

async function registerDeviceWithCloud(log) {
  if (!isCloudOnline() || !venueId || !terminalId || !terminalSecret) return;
  const profile = buildHeartbeatProfile();
  await sendDeviceRegistration({ apiUrl, terminalId, terminalSecret, profile });
  log?.info?.({ profile }, 'Device profile registered with cloud');
}

function getClusterState() {
  clusterManager.recompute();
  return clusterManager.getState();
}

function buildRelayOptions() {
  const cluster = getClusterState();
  if (cluster.mode !== CLUSTER_MODES.RELAY || !cluster.relayHost) return null;
  return { relayHost: cluster.relayHost, lanPort, lanSecret };
}

const app = await buildAgentServer({
  db,
  config: {
    port,
    host,
    apiUrl,
    venueId,
    terminalId,
    terminalSecret,
    corsOrigins,
    autoReceiptPrint,
    isCoordinator,
    coordinatorMode: getClusterState().mode,
    getCoordinatorLanHost,
    coordinatorFallback,
    getPrinterConfig: () => resolvePrinterConfig(envPrinterDefaults),
    getClusterState,
    clusterManager,
    getOwnLanHost: () => advertiseHost,
    getDeviceProfile: buildHeartbeatProfile,
    lanPort,
    lanSecret,
    buildRelayOptions,
  },
});

app.log.info(`Local agent listening on ${host}:${port}`);

const startupPrinters = resolvePrinterConfig(envPrinterDefaults);
void probeReceiptPrinterHealth({
  host: startupPrinters.receiptPrinterHost,
  port: startupPrinters.receiptPrinterPort,
}).catch((err) => app.log.warn({ err }, 'Receipt printer probe failed'));

async function withRetry(label, fn, { attempts = 12, delayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        app.log.warn({ err, attempt: i + 1, attempts }, `${label} failed — retrying`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

async function refreshCloudStatus() {
  const wasOnline = isCloudOnline();
  const { online } = await probeCloudHealth(cloudHealthUrl);
  setCloudOnline(online);
  clusterManager.recompute();
  if (online && !wasOnline && venueId && terminalId && terminalSecret) {
    setAgentMeta(db, 'sync_in_progress', 'true');
    try {
      const result = await runReconnectHandshake({
        db,
        apiUrl,
        venueId,
        terminalId,
        terminalSecret,
        log: app.log,
      });
      app.log.info(result, 'Reconnect handshake completed');
    } catch (err) {
      app.log.warn({ err }, 'Reconnect handshake failed');
    } finally {
      setAgentMeta(db, 'sync_in_progress', 'false');
    }
  }
  return online;
}

if (venueId && terminalId && terminalSecret) {
  app.log.info('Startup sync (menu, roster, cheques)…');
  await refreshCloudStatus();

  try {
    await withRetry('Venue config sync on startup', () =>
      syncVenueConfigFromServer({ apiUrl, venueId, terminalId, terminalSecret }),
    );
    app.log.info('Venue config synced on startup');
  } catch (err) {
    app.log.warn({ err }, 'Venue config sync on startup failed — using env printer defaults');
  }

  try {
    const result = await withRetry('Menu sync on startup', () =>
      syncMenuFromServer({ db, apiUrl, venueId, terminalId, terminalSecret }),
    );
    app.log.info({ updated: result.updated }, 'Menu cache synced on startup');
    setAgentMeta(db, 'menu_stale', 'false');
  } catch (err) {
    app.log.warn({ err }, 'Menu sync on startup failed');
  }

  try {
    await withRetry('Terminal roster sync on startup', () =>
      syncTerminalRosterFromServer({ db, apiUrl, venueId, terminalId, terminalSecret }),
    );
    syncHubLanConfig();
    await registerDeviceWithCloud(app.log).catch((err) =>
      app.log.warn({ err }, 'Device registration on startup failed'),
    );
  } catch (err) {
    app.log.warn({ err }, 'Roster sync on startup failed');
  }

  if (isCloudOnline()) {
    try {
      const hydration = await hydrateOpenCheques({ db, apiUrl, venueId, terminalId, terminalSecret });
      app.log.info(hydration, 'Open cheques hydrated on startup');
    } catch (err) {
      app.log.warn({ err }, 'Cheque hydration on startup failed');
    }
  }

  try {
    await withRetry('Initial sync replay', () =>
      processSyncQueue({ db, apiUrl, terminalId, terminalSecret, useBatch: true }),
    );
  } catch (err) {
    app.log.warn({ err }, 'Initial sync replay failed');
  }

  connectTerminalSocket({
    apiUrl,
    terminalId,
    terminalSecret,
    venueId,
    db,
    log: app.log,
  });

  startMenuSyncWorker({
    db,
    apiUrl,
    venueId,
    terminalId,
    terminalSecret,
    log: app.log,
    intervalMs: MENU_SYNC_WORKER_INTERVAL_MS,
  });

  startSyncRetryWorker({
    db,
    apiUrl,
    terminalId,
    terminalSecret,
    log: app.log,
    intervalMs: SYNC_FAILED_RETRY_INTERVAL_MS,
    getRelay: () => buildRelayOptions(),
    getClusterMode: () => getClusterState().mode,
  });

  setInterval(async () => {
    await refreshCloudStatus();

    const online = isCloudOnline();
    const queueDepth = getSyncQueueDepth(db);
    if (!queueDepth) return;

    const relay = buildRelayOptions();
    const cluster = getClusterState();

    if (online) {
      await processSyncQueue({
        db,
        apiUrl,
        terminalId,
        terminalSecret,
        useBatch: true,
      }).catch((err) => {
        app.log.warn({ err }, 'Periodic sync replay failed');
      });
    } else if (cluster.mode === CLUSTER_MODES.RELAY && relay) {
      await processSyncQueue({
        db,
        apiUrl,
        terminalId,
        terminalSecret,
        useBatch: true,
        relay,
      }).catch((err) => {
        app.log.warn({ err }, 'Relay sync replay failed');
      });
    }
  }, SYNC_WORKER_INTERVAL_MS);

  setInterval(async () => {
    if (!isCloudOnline()) return;
    await sendDeviceRegistration({
      apiUrl,
      terminalId,
      terminalSecret,
      profile: buildHeartbeatProfile(),
    }).catch(() => {});
  }, TERMINAL_HEARTBEAT_INTERVAL_MS);

  setInterval(async () => {
    if (!isCloudOnline()) return;
    try {
      await hydrateOpenCheques({ db, apiUrl, venueId, terminalId, terminalSecret });
    } catch (err) {
      app.log.warn({ err }, 'Periodic cheque hydration failed');
    }
  }, CHEQUE_HYDRATION_INTERVAL_MS);

  setInterval(() => {
    clusterManager.runGossip().catch((err) => app.log.warn({ err }, 'Peer gossip failed'));
  }, PEER_GOSSIP_INTERVAL_MS);

  app.log.info(
    {
      deviceLabel: resolveDeviceLabel(db, { envLabel: agentDeviceLabel, terminalId }),
      advertiseHost,
      lanPort,
      agentPeers,
      agentPriority,
      clusterMode: getClusterState().mode,
    },
    'Dynamic offline sync enabled',
  );
} else {
  app.log.warn('TERMINAL_ID / TERMINAL_SECRET / VENUE_ID not set — sync disabled');
}
