import 'dotenv/config';
import { SYNC_WORKER_INTERVAL_MS } from '@venue-pos/shared';
import { createDatabase } from './db/sqlite.js';
import { buildAgentServer } from './server.js';
import { syncMenuFromServer } from './services/menu-sync.js';
import { processSyncQueue, getSyncQueueDepth } from './services/sync-processor.js';
import { connectTerminalSocket } from './services/ws-client.js';
import {
  syncVenueConfigFromServer,
  resolvePrinterConfig,
} from './services/venue-config-sync.js';
import { probeCloudHealth, setCloudOnline } from './services/cloud-health.js';
import { sendTerminalHeartbeat } from './services/heartbeat.js';

const port = Number(process.env.PORT ?? 3456);
const host = process.env.HOST ?? '127.0.0.1';
const dbPath = process.env.SQLITE_PATH ?? './data/local.db';
const apiUrl = process.env.SERVER_API_URL ?? 'http://localhost:3000';
const cloudHealthUrl = process.env.CLOUD_HEALTH_URL ?? `${apiUrl}/health`;
const venueId = process.env.VENUE_ID ?? '';
const terminalId = process.env.TERMINAL_ID ?? '';
const terminalSecret = process.env.TERMINAL_SECRET ?? '';
const coordinatorTerminalId = process.env.COORDINATOR_TERMINAL_ID ?? '';
const coordinatorLanHost = process.env.COORDINATOR_LAN_HOST ?? '';
const coordinatorFallback = process.env.COORDINATOR_FALLBACK_ENABLED === 'true';
const isCoordinator =
  process.env.IS_COORDINATOR === 'true' || (coordinatorTerminalId && coordinatorTerminalId === terminalId);
const coordinatorMode = isCoordinator ? 'active' : coordinatorFallback ? 'client' : 'off';
const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5174').split(',');
const kitchenPrinterHost = process.env.KITCHEN_PRINTER_HOST ?? '';
const kitchenPrinterPort = Number(process.env.KITCHEN_PRINTER_PORT ?? 9100);
const autoReceiptPrint = process.env.FEATURE_AUTO_RECEIPT_PRINT !== 'false';

const db = createDatabase(dbPath);
const envPrinterDefaults = {
  kitchenPrinterHost,
  kitchenPrinterPort,
};

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
    coordinatorMode,
    coordinatorLanHost,
    coordinatorFallback,
    getPrinterConfig: () => resolvePrinterConfig(envPrinterDefaults),
  },
});

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
  const { online } = await probeCloudHealth(cloudHealthUrl);
  setCloudOnline(online);
  return online;
}

if (venueId && terminalId && terminalSecret) {
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
  } catch (err) {
    app.log.warn({ err }, 'Menu sync on startup failed');
  }

  try {
    await withRetry('Initial sync replay', () =>
      processSyncQueue({ db, apiUrl, terminalId, terminalSecret }),
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

  setInterval(async () => {
    const online = await refreshCloudStatus();
    if (online) {
      await processSyncQueue({ db, apiUrl, terminalId, terminalSecret }).catch((err) => {
        app.log.warn({ err }, 'Periodic sync replay failed');
      });
    }
    await sendTerminalHeartbeat({
      apiUrl,
      terminalId,
      terminalSecret,
      syncQueueDepth: getSyncQueueDepth(db),
    }).catch(() => {});
  }, SYNC_WORKER_INTERVAL_MS);

  if (isCoordinator) {
    app.log.info({ coordinatorLanHost }, 'LAN coordinator mode active');
  } else if (coordinatorFallback && coordinatorLanHost) {
    app.log.info({ coordinatorLanHost }, 'Coordinator failover client enabled');
  }
} else {
  app.log.warn('TERMINAL_ID / TERMINAL_SECRET / VENUE_ID not set — sync disabled');
}

app.log.info(`Local agent listening on ${host}:${port}`);
