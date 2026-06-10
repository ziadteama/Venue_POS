import { getCachedMenu } from './menu-sync.js';
import { getAgentMeta, setAgentMeta } from './terminal-cache.js';
import { isCloudOnline } from './cloud-health.js';

/** Block writes when menu cache is empty or stale while cloud is reachable for sync. */
export function assertMenuReadyForWrite(db, venueId) {
  const menu = getCachedMenu(db, venueId);
  const pendingPublish = db
    .prepare(`SELECT COUNT(*) AS n FROM menu_publish_queue WHERE status = 'pending'`)
    .get().n;
  const staleFlag = getAgentMeta(db, 'menu_stale');
  const cloudOnline = isCloudOnline();
  if (!menu?.categories?.length) {
    const err = new Error('Menu not cached — connect to hub to sync menu before taking orders');
    err.code = 'MENU_NOT_CACHED';
    err.statusCode = 503;
    throw err;
  }

  if (pendingPublish > 0 && cloudOnline) {
    const err = new Error('Menu publish pending — sync menu before new orders');
    err.code = 'MENU_PUBLISH_PENDING';
    err.statusCode = 409;
    throw err;
  }

  if (staleFlag === 'true' && cloudOnline) {
    const err = new Error('Menu is stale — sync required before new orders');
    err.code = 'MENU_STALE';
    err.statusCode = 409;
    throw err;
  }
}

export function markMenuStale(db, stale = true) {
  setAgentMeta(db, 'menu_stale', stale ? 'true' : 'false');
}
