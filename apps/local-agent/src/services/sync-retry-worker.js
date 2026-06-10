import { CLUSTER_MODES, SYNC_FAILED_RETRY_INTERVAL_MS } from '@venue-pos/shared';
import { isCloudOnline } from './cloud-health.js';
import {
  getFailedSyncCount,
  getSyncQueueDepth,
  processSyncQueue,
  requeueAllFailedSyncJobs,
} from './sync-processor.js';

/**
 * Re-queue failed sync jobs and drain pending queue when cloud or LAN relay is available.
 * Runs on a timer so POS never needs a manual Review action for transient failures.
 */
export async function runSyncBackgroundRetry({
  db,
  apiUrl,
  terminalId,
  terminalSecret,
  log,
  relay = null,
  clusterMode = CLUSTER_MODES.DIRECT,
}) {
  const failed = getFailedSyncCount(db);
  const pending = getSyncQueueDepth(db);
  if (!failed && !pending) {
    return { skipped: 'idle' };
  }

  const online = isCloudOnline();
  const canRelay = clusterMode === CLUSTER_MODES.RELAY && relay?.relayHost;
  if (!online && !canRelay) {
    return { skipped: 'offline' };
  }

  if (failed > 0) {
    const requeued = requeueAllFailedSyncJobs(db);
    log?.info?.({ requeued }, 'Background sync retry re-queued failed jobs');
  }

  const results = await processSyncQueue({
    db,
    apiUrl,
    terminalId,
    terminalSecret,
    useBatch: true,
    relay: canRelay ? relay : null,
  });

  const stillFailed = getFailedSyncCount(db);
  const stillPending = getSyncQueueDepth(db);
  if (stillFailed || stillPending) {
    log?.warn?.({ stillFailed, stillPending }, 'Background sync retry incomplete');
  }

  return { ok: true, processed: results.length, stillFailed, stillPending };
}

export function startSyncRetryWorker(ctx) {
  const intervalMs = ctx.intervalMs ?? SYNC_FAILED_RETRY_INTERVAL_MS;
  const tick = () => {
    const relay = ctx.getRelay?.() ?? null;
    const clusterMode = ctx.getClusterMode?.() ?? CLUSTER_MODES.DIRECT;
    runSyncBackgroundRetry({ ...ctx, relay, clusterMode }).catch((err) =>
      ctx.log?.warn?.({ err }, 'Sync retry worker tick failed'),
    );
  };
  tick();
  return setInterval(tick, intervalMs);
}
