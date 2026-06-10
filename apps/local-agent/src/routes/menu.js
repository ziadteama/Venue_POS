import { getCachedMenu, syncMenuFromServer } from '../services/menu-sync.js';
import { markMenuPublishQueueDrained } from '../services/ws-client.js';

export function registerMenuRoutes(app, { db, apiUrl, venueId, terminalId, terminalSecret }) {
  app.get('/v1/menu', async () => {
    const menu = getCachedMenu(db, venueId);
    if (!menu) return { venueId, categories: [], versionHash: null };
    return menu;
  });

  app.post('/v1/menu/sync', async () => {
    const result = await syncMenuFromServer({ db, apiUrl, venueId, terminalId, terminalSecret });
    markMenuPublishQueueDrained(db);
    return result;
  });
}
