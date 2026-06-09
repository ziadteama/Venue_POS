import { randomUUID } from 'node:crypto';
import { SYNC_EVENT_TYPES, SYNC_MAX_RETRIES } from '@venue-pos/shared';
import { apiFetch } from './api-fetch.js';

const CHEQUE_SYNC_TYPES = new Set([
  SYNC_EVENT_TYPES.CHEQUE_OPEN,
  SYNC_EVENT_TYPES.CHEQUE_FIRE,
  SYNC_EVENT_TYPES.CHEQUE_PAY,
  SYNC_EVENT_TYPES.CHEQUE_DISCOUNT,
  SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_PAY,
]);

function buildReplayEvent(job, payload, syncId) {
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_CREATE) {
    return null; // individual endpoint
  }
  if (CHEQUE_SYNC_TYPES.has(job.event_type)) {
    return { syncId, eventType: job.event_type, payload };
  }
  return null;
}

async function replayJob(apiUrl, terminalId, terminalSecret, job, payload, syncId) {
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_CREATE) {
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        id: payload.orderId,
        cashierId: payload.cashierId,
        tableLabel: payload.tableLabel,
        syncId,
      }),
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_ADD_ITEM) {
    return apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${payload.orderId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        menuItemId: payload.menuItemId,
        quantity: payload.quantity,
        modifiers: payload.modifiers,
        syncId,
      }),
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_SEND) {
    return apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${payload.orderId}/send`, {
      method: 'POST',
      body: JSON.stringify({ syncId }),
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_PATCH_ITEM) {
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/orders/${payload.orderId}/items/${payload.itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ quantity: payload.quantity, syncId }),
      },
    );
  }
  if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_OPEN) {
    const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open', {
      method: 'POST',
      body: JSON.stringify({
        cashierId: payload.cashierId,
        tableLabel: payload.tableLabel,
        syncId,
      }),
    });
    if (payload.chequeId && result?.id) {
      return { linkLocalCheque: { serverId: result.id, localId: payload.chequeId }, result };
    }
    return result;
  }
  if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_FIRE) {
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${payload.chequeId}/fire`,
      { method: 'POST', body: JSON.stringify({ syncId }) },
    );
  }
  if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_PAY) {
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${payload.chequeId}/pay`,
      {
        method: 'POST',
        body: JSON.stringify({ ...payload.payBody, syncId }),
      },
    );
  }
  if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_DISCOUNT) {
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${payload.chequeId}/discount`,
      {
        method: 'POST',
        body: JSON.stringify({ ...payload.body, syncId }),
      },
    );
  }
  if (job.event_type === SYNC_EVENT_TYPES.PAYMENT_CREATE) {
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/sync/events', {
      method: 'POST',
      body: JSON.stringify({
        events: [{ syncId, eventType: job.event_type, payload }],
      }),
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_PAY) {
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/sync/events', {
      method: 'POST',
      body: JSON.stringify({
        events: [{ syncId, eventType: job.event_type, payload }],
      }),
    });
  }
  throw new Error(`Unknown sync event: ${job.event_type}`);
}

export async function processSyncQueue({
  db,
  apiUrl,
  terminalId,
  terminalSecret,
  useBatch = false,
}) {
  const pending = db
    .prepare(`SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20`)
    .all();

  if (useBatch && pending.length > 0) {
    const batchEvents = [];
    const batchJobs = [];
    for (const job of pending) {
      const payload = JSON.parse(job.payload_json);
      const syncId = payload.syncId ?? job.id;
      const evt = buildReplayEvent(job, payload, syncId);
      if (evt) {
        batchEvents.push(evt);
        batchJobs.push({ job, payload, syncId });
      }
    }
    if (batchEvents.length >= 2) {
      try {
        await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/sync/events', {
          method: 'POST',
          body: JSON.stringify({ events: batchEvents }),
        });
        for (const { job } of batchJobs) {
          db.prepare(`UPDATE sync_queue SET status = 'done' WHERE id = ?`).run(job.id);
        }
        const remaining = pending.filter((j) => !batchJobs.some((b) => b.job.id === j.id));
        if (!remaining.length) {
          return batchJobs.map((b) => ({ id: b.job.id, status: 'done' }));
        }
      } catch {
        /* fall through to per-job replay */
      }
    }
  }

  const results = [];
  for (const job of pending) {
    try {
      const payload = JSON.parse(job.payload_json);
      const syncId = payload.syncId ?? job.id;
      const result = await replayJob(apiUrl, terminalId, terminalSecret, job, payload, syncId);

      if (result?.linkLocalCheque) {
        db.prepare(`UPDATE cheques SET server_id = ?, synced_at = datetime('now') WHERE id = ?`).run(
          result.linkLocalCheque.serverId,
          result.linkLocalCheque.localId,
        );
      }

      db.prepare(`UPDATE sync_queue SET status = 'done' WHERE id = ?`).run(job.id);
      results.push({ id: job.id, status: 'done' });
    } catch (err) {
      const retries =
        db.prepare(`SELECT retry_count FROM sync_queue WHERE id = ?`).get(job.id)?.retry_count ?? 0;
      const nextStatus = retries + 1 >= SYNC_MAX_RETRIES ? 'failed' : 'pending';
      db.prepare(
        `UPDATE sync_queue SET retry_count = retry_count + 1, status = ? WHERE id = ?`,
      ).run(nextStatus, job.id);
      results.push({ id: job.id, status: 'failed', queueStatus: nextStatus, error: err.message });
    }
  }
  return results;
}

export function enqueueSync(db, eventType, payload, syncId = randomUUID()) {
  const body = { ...payload, syncId };
  db.prepare(
    `INSERT INTO sync_queue (id, event_type, payload_json, status) VALUES (?, ?, ?, 'pending')`,
  ).run(syncId, eventType, JSON.stringify(body));
  return syncId;
}

export function getSyncQueueDepth(db) {
  return db.prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`).get().n;
}

export function getFailedSyncCount(db) {
  return db.prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'failed'`).get().n;
}

export function getSyncProgress(db) {
  const pending = getSyncQueueDepth(db);
  const failed = getFailedSyncCount(db);
  const syncing = db.prepare(`SELECT value FROM agent_meta WHERE key = 'sync_in_progress'`).get()
    ?.value;
  return {
    pending,
    failed,
    syncing: syncing === 'true',
    lastDrained: db.prepare(`SELECT value FROM agent_meta WHERE key = 'last_sync_at'`).get()?.value,
  };
}
