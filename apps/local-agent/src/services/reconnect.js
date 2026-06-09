import { apiFetch } from './api-fetch.js';
import { syncMenuFromServer } from './menu-sync.js';
import { saveStaffCache, saveFeaturesCache, setAgentMeta } from './terminal-cache.js';
import { processSyncQueue, getSyncQueueDepth, getFailedSyncCount, setSyncDrainProgress, clearSyncDrainProgress } from './sync-processor.js';
import { hydrateOpenCheques } from './cheque-hydration.js';

export async function runReconnectHandshake({
  db,
  apiUrl,
  venueId,
  terminalId,
  terminalSecret,
  log,
}) {
  const menu = db
    .prepare(`SELECT version_hash FROM menu_cache WHERE venue_id = ?`)
    .get(venueId);
  const lastSyncAt = db.prepare(`SELECT value FROM agent_meta WHERE key = 'last_sync_at'`).get()
    ?.value;

  const handshake = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/terminals/reconnect', {
    method: 'POST',
    body: JSON.stringify({
      menuVersionHash: menu?.version_hash ?? undefined,
      lastSyncAt: lastSyncAt ?? undefined,
    }),
  });

  if (handshake.staff?.length) saveStaffCache(db, handshake.staff);
  if (handshake.features) saveFeaturesCache(db, venueId, handshake.features);
  if (handshake.terminal?.name) {
    setAgentMeta(db, 'hub_device_label', handshake.terminal.name);
  }

  if (handshake.menuStale) {
    setAgentMeta(db, 'menu_stale', 'true');
    await syncMenuFromServer({ db, apiUrl, venueId, terminalId, terminalSecret });
    setAgentMeta(db, 'menu_stale', 'false');
    if (handshake.menuVersionHash) {
      setAgentMeta(db, 'menu_version_hash', handshake.menuVersionHash);
    }
  } else {
    setAgentMeta(db, 'menu_stale', 'false');
  }

  const pendingBefore = getSyncQueueDepth(db);
  let drained = 0;
  setSyncDrainProgress(db, { total: pendingBefore, done: 0 });
  while (getSyncQueueDepth(db) > 0 && drained < pendingBefore + 50) {
    const batch = await processSyncQueue({ db, apiUrl, terminalId, terminalSecret, useBatch: true });
    if (!batch.length) break;
    drained += batch.filter((r) => r.status === 'done').length;
    setSyncDrainProgress(db, { done: drained });
  }
  clearSyncDrainProgress(db);

  setAgentMeta(db, 'last_sync_at', handshake.serverTime ?? new Date().toISOString());

  try {
    await hydrateOpenCheques({ db, apiUrl, venueId, terminalId, terminalSecret });
  } catch (err) {
    log?.warn?.({ err }, 'Cheque hydration after reconnect failed');
  }

  return {
    menuStale: handshake.menuStale,
    pendingBefore,
    drained,
    pendingAfter: getSyncQueueDepth(db),
    failedCount: getFailedSyncCount(db),
  };
}
