import { io } from 'socket.io-client';
import { syncMenuFromServer } from './menu-sync.js';
import { syncVenueConfigFromServer } from './venue-config-sync.js';

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
  });

  socket.on('menu:updated', async (msg) => {
    const payload = msg?.payload ?? msg;
    if (!payload.venueIds?.includes(venueId)) return;
    try {
      const result = await syncMenuFromServer({
        db,
        apiUrl,
        venueId,
        terminalId,
        terminalSecret,
      });
      log.info({ updated: result.updated }, 'Menu refreshed from WebSocket event');
    } catch (err) {
      log.warn({ err }, 'Menu refresh after WS event failed');
    }
  });

  socket.on('venue:config_updated', async (msg) => {
    const payload = msg?.payload ?? msg;
    if (payload.venueId !== venueId) return;
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
