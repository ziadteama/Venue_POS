import 'dotenv/config';
import { createDatabase } from './db/sqlite.js';
import { buildAgentServer } from './server.js';
import { syncMenuFromServer } from './services/menu-sync.js';
import { processSyncQueue } from './services/sync-processor.js';
import { connectTerminalSocket } from './services/ws-client.js';
import {
  syncVenueConfigFromServer,
  resolvePrinterConfig,
} from './services/venue-config-sync.js';

const port = Number(process.env.PORT ?? 3456);
const host = process.env.HOST ?? '127.0.0.1';
const dbPath = process.env.SQLITE_PATH ?? './data/local.db';
const apiUrl = process.env.SERVER_API_URL ?? 'http://localhost:3000';
const venueId = process.env.VENUE_ID ?? '';
const terminalId = process.env.TERMINAL_ID ?? '';
const terminalSecret = process.env.TERMINAL_SECRET ?? '';
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

if (venueId && terminalId && terminalSecret) {
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

  setInterval(() => {
    processSyncQueue({ db, apiUrl, terminalId, terminalSecret }).catch((err) => {
      app.log.warn({ err }, 'Periodic sync replay failed');
    });
  }, 30000);
} else {
  app.log.warn('TERMINAL_ID / TERMINAL_SECRET / VENUE_ID not set — sync disabled');
}

app.log.info(`Local agent listening on ${host}:${port}`);
