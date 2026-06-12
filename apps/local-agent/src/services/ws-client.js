import { io } from 'socket.io-client';
import { apiFetch } from './api-fetch.js';
import { runMenuBackgroundSync } from './menu-sync-worker.js';
import { enqueueMenuPublish } from './menu-publish-queue.js';
import { syncVenueConfigFromServer } from './venue-config-sync.js';
import { isCloudOnline } from './cloud-health.js';
import { publishAgentEvent } from './agent-events.js';
import {
  patchFeaturesTables,
  saveFeaturesCache,
  setAgentMeta,
  syncTerminalRosterFromServer,
} from './terminal-cache.js';

export { markMenuPublishQueueDrained } from './menu-publish-queue.js';

/** @deprecated Use runMenuBackgroundSync — kept for reconnect and tests. */
export async function drainMenuPublishQueue(ctx) {
  return runMenuBackgroundSync(ctx);
}

export function connectTerminalSocket({
  apiUrl,
  terminalId,
  terminalSecret,
  venueId,
  db,
  log,
}) {
  const socket = io(apiUrl, {
    path: '/socket.io',
    auth: { terminalId, terminalSecret },
    transports: ['websocket'],
  });

  async function refreshHubTablesFromCloud() {
    try {
      const data = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/features');
      saveFeaturesCache(db, venueId, data);
      if (Array.isArray(data?.tables)) {
        publishAgentEvent('hub:tables_updated', {
          tables: data.tables,
          updatedAt: new Date().toISOString(),
        });
      }
      log.info({ count: data?.tables?.length ?? 0 }, 'Hub tables synced on cloud connect');
    } catch (err) {
      log.warn({ err }, 'Hub tables sync on connect failed');
    }
  }

  socket.on('connect', () => {
    log.info('Terminal WebSocket connected');
    if (isCloudOnline()) {
      drainMenuPublishQueue({ db, apiUrl, venueId, terminalId, terminalSecret, log }).catch(
        (err) => log.warn({ err }, 'Menu publish drain on connect failed'),
      );
      refreshHubTablesFromCloud().catch(() => {});
    }
  });

  socket.on('menu:updated', async (msg) => {
    const payload = msg?.payload ?? msg;
    const matchesVenue =
      payload.venueId === venueId ||
      (Array.isArray(payload.venueIds) && payload.venueIds.includes(venueId));
    if (!matchesVenue) return;
    if (!isCloudOnline()) {
      enqueueMenuPublish(db, payload);
      setAgentMeta(db, 'menu_stale', 'true');
      log.info('Menu publish queued — terminal offline');
      return;
    }
    const result = await runMenuBackgroundSync({
      db,
      apiUrl,
      venueId,
      terminalId,
      terminalSecret,
      log,
    });
    if (result.ok) {
      log.info({ updated: result.updated }, 'Menu refreshed from WebSocket event');
    } else if (!result.skipped) {
      enqueueMenuPublish(db, payload);
      setAgentMeta(db, 'menu_stale', 'true');
    }
  });

  socket.on('hub:tables_updated', (msg) => {
    const payload = msg?.payload ?? msg;
    if (!Array.isArray(payload?.tables)) return;
    patchFeaturesTables(db, venueId, payload.tables);
    publishAgentEvent('hub:tables_updated', {
      tables: payload.tables,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
    });
    log.info({ count: payload.tables.length }, 'Hub table list refreshed from WebSocket');
  });

  socket.on('floor:table_updated', (msg) => {
    const payload = msg?.payload ?? msg;
    if (!payload?.tableLabel) return;
    publishAgentEvent('floor:table_updated', payload);
    log.debug({ table: payload.tableLabel }, 'Floor table update relayed to POS');
  });

  socket.on('venue:config_updated', async (msg) => {
    const payload = msg?.payload ?? msg;
    if (payload.venueId !== venueId) return;
    if (!isCloudOnline()) return;
    const changes = payload.changes ?? [];
    try {
      if (changes.some((c) => c === 'terminals' || c === 'kiosk_exit_pin')) {
        await syncTerminalRosterFromServer({
          db,
          apiUrl,
          venueId,
          terminalId,
          terminalSecret,
        });
        log.info({ changes }, 'Terminal roster refreshed from WebSocket event');
      } else {
        await syncVenueConfigFromServer({ apiUrl, venueId, terminalId, terminalSecret });
        log.info({ changes }, 'Venue config refreshed from WebSocket event');
      }
    } catch (err) {
      log.warn({ err }, 'Venue config refresh after WS event failed');
    }
  });

  socket.on('disconnect', () => {
    log.warn('Terminal WebSocket disconnected');
  });

  return socket;
}
