import { processSyncQueue } from '../services/sync-processor.js';

export function registerSyncRoutes(app, { db, apiUrl, terminalId, terminalSecret }) {
  app.post('/v1/sync/replay', async () => {
    return processSyncQueue({ db, apiUrl, terminalId, terminalSecret });
  });
}
