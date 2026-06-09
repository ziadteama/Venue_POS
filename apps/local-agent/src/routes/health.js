import { getCachedMenu } from '../services/menu-sync.js';
import { getPrinterHealth } from '../services/kitchen-printer.js';
import { isCloudOnline } from '../services/cloud-health.js';
import { getSyncQueueDepth } from '../services/sync-processor.js';

export function registerHealthRoutes(app, { db, venueId, isCoordinator, coordinatorMode }) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'local-agent',
    syncQueueDepth: getSyncQueueDepth(db),
    menuCached: Boolean(getCachedMenu(db, venueId)),
    printer: getPrinterHealth(),
    cloudOnline: isCloudOnline(),
    isCoordinator,
    coordinatorMode,
    timestamp: new Date().toISOString(),
  }));

  app.get('/v1/status', async () => ({
    online: isCloudOnline(),
    sqlite: 'connected',
    venueId,
    isCoordinator,
    coordinatorMode,
    syncQueueDepth: getSyncQueueDepth(db),
    version: '0.2.0',
  }));
}
