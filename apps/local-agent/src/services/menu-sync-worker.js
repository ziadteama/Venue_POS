import { MENU_SYNC_WORKER_INTERVAL_MS } from '@venue-pos/shared';
import { isCloudOnline } from './cloud-health.js';
import { getCachedMenu, syncMenuFromServer } from './menu-sync.js';
import { getAgentMeta } from './terminal-cache.js';
import { publishAgentEvent } from './agent-events.js';
import {
  markMenuPublishQueueDrained,
  pendingPublishCount,
} from './menu-publish-queue.js';

/** Returns true when a cloud menu fetch may be needed. */
export function menuBackgroundSyncNeeded(db, venueId) {
  const menu = getCachedMenu(db, venueId);
  const pending = pendingPublishCount(db);
  const stale = getAgentMeta(db, 'menu_stale') === 'true';
  return pending > 0 || stale || !menu?.categories?.length;
}

/**
 * Drain pending menu publishes and refresh cache when online.
 * Safe to call from timers, WS handlers, and reconnect — no-ops while offline.
 */
export async function runMenuBackgroundSync({
  db,
  apiUrl,
  venueId,
  terminalId,
  terminalSecret,
  log,
  force = false,
}) {
  if (!isCloudOnline()) {
    return { skipped: 'offline' };
  }
  if (!force && !menuBackgroundSyncNeeded(db, venueId)) {
    return { skipped: 'up_to_date' };
  }

  try {
    const result = await syncMenuFromServer({ db, apiUrl, venueId, terminalId, terminalSecret });
    markMenuPublishQueueDrained(db);
    if (result.updated) {
      publishAgentEvent('menu:updated', {
        venueId,
        versionHash: result.menu?.versionHash ?? null,
        updatedAt: new Date().toISOString(),
      });
    }
    log?.info?.(
      { updated: result.updated, pending: pendingPublishCount(db) },
      'Background menu sync completed',
    );
    return { ok: true, updated: result.updated };
  } catch (err) {
    log?.warn?.({ err }, 'Background menu sync failed — will retry');
    return { ok: false, error: err.message };
  }
}

export function startMenuSyncWorker(ctx) {
  const intervalMs = ctx.intervalMs ?? MENU_SYNC_WORKER_INTERVAL_MS;
  const tick = () => {
    runMenuBackgroundSync(ctx).catch((err) => ctx.log?.warn?.({ err }, 'Menu sync worker tick failed'));
  };
  tick();
  return setInterval(tick, intervalMs);
}
