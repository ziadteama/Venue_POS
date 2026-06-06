import { getCachedMenu } from '../services/menu-sync.js';
import { getPrinterHealth } from '../services/kitchen-printer.js';

export function registerHealthRoutes(app, { db, venueId }) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'local-agent',
    syncQueueDepth: db.prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`).get()
      .n,
    menuCached: Boolean(getCachedMenu(db, venueId)),
    printer: getPrinterHealth(),
    timestamp: new Date().toISOString(),
  }));

  app.get('/v1/status', async () => ({
    online: true,
    sqlite: 'connected',
    venueId,
    version: '0.1.0',
  }));
}
