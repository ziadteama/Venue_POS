import { getCachedMenu } from '../services/menu-sync.js';
import { getPrinterHealth } from '../services/kitchen-printer.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  getSyncQueueDepth,
  getFailedSyncCount,
  getSyncProgress,
} from '../services/sync-processor.js';
import { getAgentMeta } from '../services/terminal-cache.js';

export function registerHealthRoutes(
  app,
  { db, venueId, isCoordinator, coordinatorMode, coordinatorLanHost, coordinatorFallback },
) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'local-agent',
    syncQueueDepth: getSyncQueueDepth(db),
    syncFailedCount: getFailedSyncCount(db),
    syncProgress: getSyncProgress(db),
    menuCached: Boolean(getCachedMenu(db, venueId)),
    menuStale: getAgentMeta(db, 'menu_stale') === 'true',
    printer: getPrinterHealth(),
    cloudOnline: isCloudOnline(),
    isCoordinator,
    coordinatorMode,
    coordinatorLanHost: coordinatorLanHost || null,
    coordinatorFallback: Boolean(coordinatorFallback),
    timestamp: new Date().toISOString(),
  }));

  app.get('/v1/status', async () => ({
    online: isCloudOnline(),
    sqlite: 'connected',
    venueId,
    isCoordinator,
    coordinatorMode,
    syncQueueDepth: getSyncQueueDepth(db),
    syncFailedCount: getFailedSyncCount(db),
    syncProgress: getSyncProgress(db),
    menuStale: getAgentMeta(db, 'menu_stale') === 'true',
    version: '0.2.0',
  }));

  app.get('/v1/sync/progress', async () => getSyncProgress(db));
}
