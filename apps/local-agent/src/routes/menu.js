import { getCachedMenu, syncMenuFromServer } from '../services/menu-sync.js';

export function registerMenuRoutes(app, { db, apiUrl, venueId, terminalId, terminalSecret }) {
  app.get('/v1/menu', async () => {
    const menu = getCachedMenu(db, venueId);
    if (!menu) return { venueId, categories: [], versionHash: null };
    return menu;
  });

  app.post('/v1/menu/sync', async () => {
    return syncMenuFromServer({ db, apiUrl, venueId, terminalId, terminalSecret });
  });
}
