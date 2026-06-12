import {
  processSyncQueue,
  listFailedSyncJobs,
  retryFailedSyncJob,
  dismissFailedSyncJob,
  getSyncProgress,
} from '../services/sync-processor.js';

export function registerSyncRoutes(app, { db, apiUrl, terminalId, terminalSecret, buildRelayOptions }) {
  app.post('/v1/sync/replay', async () => {
    return processSyncQueue({
      db,
      apiUrl,
      terminalId,
      terminalSecret,
      useBatch: true,
      relay: buildRelayOptions?.() ?? null,
    });
  });

  app.get('/v1/sync/failed', async () => ({
    jobs: listFailedSyncJobs(db),
    progress: getSyncProgress(db),
  }));

  app.post('/v1/sync/failed/:id/retry', async (request, reply) => {
    const ok = retryFailedSyncJob(db, request.params.id);
    if (!ok) return reply.status(404).send({ error: 'Failed sync job not found' });
    const results = await processSyncQueue({
      db,
      apiUrl,
      terminalId,
      terminalSecret,
      useBatch: true,
      relay: buildRelayOptions?.() ?? null,
    });
    return { retried: request.params.id, results, progress: getSyncProgress(db) };
  });

  app.post('/v1/sync/failed/:id/dismiss', async (request, reply) => {
    const ok = dismissFailedSyncJob(db, request.params.id);
    if (!ok) return reply.status(404).send({ error: 'Failed sync job not found' });
    return { dismissed: request.params.id, progress: getSyncProgress(db) };
  });
}
