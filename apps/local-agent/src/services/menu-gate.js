import { getCachedMenu } from './menu-sync.js';
import { setAgentMeta } from './terminal-cache.js';

/**
 * Block writes only when no usable menu cache exists.
 * Pending publishes and stale flags are drained by the background menu sync worker.
 */
export function assertMenuReadyForWrite(db, venueId) {
  const menu = getCachedMenu(db, venueId);
  if (!menu?.categories?.length) {
    const err = new Error('Menu not cached — connect to hub to sync menu before taking orders');
    err.code = 'MENU_NOT_CACHED';
    err.statusCode = 503;
    throw err;
  }
}

export function markMenuStale(db, stale = true) {
  setAgentMeta(db, 'menu_stale', stale ? 'true' : 'false');
}
