import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { syncMenuFromServer } from './menu-sync.js';
import { syncVenueConfigFromServer } from './venue-config-sync.js';
import { isCloudOnline } from './cloud-health.js';
import { patchFeaturesTables, setAgentMeta } from './terminal-cache.js';

function enqueueMenuPublish(db, payload) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO menu_publish_queue (id, version_hash, payload_json, status)
     VALUES (?, ?, ?, 'pending')`,
  ).run(id, payload.versionHash ?? '', JSON.stringify(payload));
}

export async function drainMenuPublishQueue({ db, apiUrl, venueId, terminalId, terminalSecret, log }) {
  const pending = db
    .prepare(`SELECT * FROM menu_publish_queue WHERE status = 'pending' ORDER BY created_at ASC`)
    .all();
  for (const row of pending) {
    try {
      await syncMenuFromServer({ db, apiUrl, venueId, terminalId, terminalSecret });
      db.prepare(`UPDATE menu_publish_queue SET status = 'done' WHERE id = ?`).run(row.id);
      setAgentMeta(db, 'menu_stale', 'false');
    } catch (err) {
      log.warn({ err, id: row.id }, 'Menu publish queue drain failed');
      break;
    }
  }
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

  socket.on('connect', () => {
    log.info('Terminal WebSocket connected');
    if (isCloudOnline()) {
      drainMenuPublishQueue({ db, apiUrl, venueId, terminalId, terminalSecret, log }).catch(
        (err) => log.warn({ err }, 'Menu publish drain on connect failed'),
      );
    }
  });

  socket.on('menu:updated', async (msg) => {
    const payload = msg?.payload ?? msg;
    if (!payload.venueIds?.includes(venueId)) return;
    if (!isCloudOnline()) {
      enqueueMenuPublish(db, payload);
      setAgentMeta(db, 'menu_stale', 'true');
      log.info('Menu publish queued — terminal offline');
      return;
    }
    try {
      const result = await syncMenuFromServer({
        db,
        apiUrl,
        venueId,
        terminalId,
        terminalSecret,
      });
      log.info({ updated: result.updated }, 'Menu refreshed from WebSocket event');
      setAgentMeta(db, 'menu_stale', 'false');
    } catch (err) {
      log.warn({ err }, 'Menu refresh after WS event failed');
      enqueueMenuPublish(db, payload);
    }
  });

  socket.on('hub:tables_updated', (msg) => {
    const payload = msg?.payload ?? msg;
    if (!Array.isArray(payload?.tables)) return;
    patchFeaturesTables(db, venueId, payload.tables);
    log.info({ count: payload.tables.length }, 'Hub table list refreshed from WebSocket');
  });

  socket.on('venue:config_updated', async (msg) => {
    const payload = msg?.payload ?? msg;
    if (payload.venueId !== venueId) return;
    if (!isCloudOnline()) return;
    try {
      await syncVenueConfigFromServer({ apiUrl, venueId, terminalId, terminalSecret });
      log.info({ changes: payload.changes }, 'Venue config refreshed from WebSocket event');
    } catch (err) {
      log.warn({ err }, 'Venue config refresh after WS event failed');
    }
  });

  socket.on('disconnect', () => {
    log.warn('Terminal WebSocket disconnected');
  });

  return socket;
}
