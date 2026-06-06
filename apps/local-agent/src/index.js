import 'dotenv/config';
import { createDatabase } from './db/sqlite.js';
import { buildAgentServer } from './server.js';
import { syncMenuFromServer } from './services/menu-sync.js';
import { processSyncQueue } from './services/sync-processor.js';
import { connectTerminalSocket } from './services/ws-client.js';

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

const db = createDatabase(dbPath);
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
    kitchenPrinterHost,
    kitchenPrinterPort,
  },
});

if (venueId && terminalId && terminalSecret) {
  try {
    const result = await syncMenuFromServer({
      db,
      apiUrl,
      venueId,
      terminalId,
      terminalSecret,
    });
    app.log.info({ updated: result.updated }, 'Menu cache synced on startup');
  } catch (err) {
    app.log.warn({ err }, 'Menu sync on startup failed');
  }

  try {
    await processSyncQueue({ db, apiUrl, terminalId, terminalSecret });
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
