import { randomUUID } from 'node:crypto';
import { SYNC_EVENT_TYPES, SYNC_MAX_RETRIES } from '@venue-pos/shared';
import { apiFetch, parseUpstreamError } from './api-fetch.js';
import { relaySyncEvents, relayApiCall } from './relay-client.js';
import { linkLocalShiftServerId } from './shift-cache.js';
import { setAgentMeta } from './terminal-cache.js';

const CHEQUE_SYNC_TYPES = new Set([
  SYNC_EVENT_TYPES.CHEQUE_OPEN,
  SYNC_EVENT_TYPES.CHEQUE_FIRE,
  SYNC_EVENT_TYPES.CHEQUE_PAY,
  SYNC_EVENT_TYPES.CHEQUE_DISCOUNT,
  SYNC_EVENT_TYPES.CHEQUE_VOID,
  SYNC_EVENT_TYPES.CHEQUE_CLEAR,
  SYNC_EVENT_TYPES.CHEQUE_TABLE_MOVE,
  SYNC_EVENT_TYPES.CHEQUE_TRANSFER,
  SYNC_EVENT_TYPES.CHEQUE_SPLIT,
  SYNC_EVENT_TYPES.CHEQUE_CHECK_PRINT,
  SYNC_EVENT_TYPES.CHEQUE_PRE_PAY_ADJUST,
  SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_PAY,
  SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_REPLAY,
]);

const SHIFT_SYNC_TYPES = new Set([
  SYNC_EVENT_TYPES.SHIFT_OPEN,
  SYNC_EVENT_TYPES.SHIFT_CLOSE,
]);

const SKIPPABLE_REPLAY_MESSAGES = [
  'Order is not editable',
  'Items can only be added to draft orders',
  'Order not found',
  'Order item not found',
];

/** Permanent upstream rejections that mean local state already advanced — drop the queue row. */
export function isReplaySkippableError(err) {
  if (!err?.statusCode) return false;
  if (err.statusCode === 404) return true;
  if (err.statusCode === 400) {
    const msg = err.apiMessage ?? parseUpstreamError(err.responseText ?? '', '');
    return SKIPPABLE_REPLAY_MESSAGES.some((fragment) => msg.includes(fragment));
  }
  return false;
}

function buildReplayEvent(job, payload, syncId) {
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_CREATE) {
    return null; // individual endpoint
  }
  if (CHEQUE_SYNC_TYPES.has(job.event_type)) {
    return { syncId, eventType: job.event_type, payload };
  }
  if (SHIFT_SYNC_TYPES.has(job.event_type)) {
    return { syncId, eventType: job.event_type, payload };
  }
  return null;
}

async function sendBatchToCloud(apiUrl, terminalId, terminalSecret, events, relay) {
  if (relay?.relayHost) {
    return relaySyncEvents({
      relayHost: relay.relayHost,
      lanPort: relay.lanPort,
      lanSecret: relay.lanSecret,
      terminalId,
      terminalSecret,
      events,
    });
  }
  return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/sync/events', {
    method: 'POST',
    body: JSON.stringify({ events }),
  });
}

async function relayApiCallForJob(relay, terminalId, terminalSecret, job, payload, syncId) {
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_CREATE) {
    return relayApiCall({
      ...relay,
      terminalId,
      terminalSecret,
      path: '/api/v1/orders',
      method: 'POST',
      body: { id: payload.orderId, cashierId: payload.cashierId, tableLabel: payload.tableLabel, syncId },
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_ADD_ITEM) {
    return relayApiCall({
      ...relay,
      terminalId,
      terminalSecret,
      path: `/api/v1/orders/${payload.orderId}/items`,
      method: 'POST',
      body: { menuItemId: payload.menuItemId, quantity: payload.quantity, modifiers: payload.modifiers, syncId },
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_SEND) {
    return relayApiCall({
      ...relay,
      terminalId,
      terminalSecret,
      path: `/api/v1/orders/${payload.orderId}/send`,
      method: 'POST',
      body: { syncId },
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_PATCH_ITEM) {
    return relayApiCall({
      ...relay,
      terminalId,
      terminalSecret,
      path: `/api/v1/orders/${payload.orderId}/items/${payload.itemId}`,
      method: 'PATCH',
      body: { quantity: payload.quantity, syncId },
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_VOID) {
    return relayApiCall({
      ...relay,
      terminalId,
      terminalSecret,
      path: `/api/v1/orders/${payload.orderId}/void`,
      method: 'POST',
      body: {
        cashierId: payload.cashierId,
        managerPin: payload.managerPin,
        reason: payload.reason,
        syncId,
      },
    });
  }
  if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_OPEN) {
    const result = await relayApiCall({
      ...relay,
      terminalId,
      terminalSecret,
      path: '/api/v1/cheques/open',
      method: 'POST',
      body: { cashierId: payload.cashierId, tableLabel: payload.tableLabel, syncId },
    });
    if (payload.chequeId && result?.id) {
      return { linkLocalCheque: { serverId: result.id, localId: payload.chequeId }, result };
    }
    return result;
  }
  if (job.event_type === SYNC_EVENT_TYPES.SHIFT_OPEN) {
    const result = await relayApiCall({
      ...relay,
      terminalId,
      terminalSecret,
      path: '/api/v1/shifts/open',
      method: 'POST',
      body: { cashierId: payload.cashierId, openFloat: payload.openFloat, syncId },
    });
    if (payload.shiftId && result?.id) {
      return { linkLocalShift: { serverId: result.id, localId: payload.shiftId }, result };
    }
    return result;
  }
  if (job.event_type === SYNC_EVENT_TYPES.SHIFT_CLOSE) {
    return relayApiCall({
      ...relay,
      terminalId,
      terminalSecret,
      path: '/api/v1/shifts/close',
      method: 'POST',
      body: {
        cashierId: payload.cashierId,
        closeFloat: payload.closeFloat,
        managerPin: payload.managerPin,
        syncId,
      },
    });
  }
  throw new Error(`Unknown sync event for relay: ${job.event_type}`);
}

async function replayJob(apiUrl, terminalId, terminalSecret, job, payload, syncId, relay) {
  if (relay?.relayHost) {
    const evt = buildReplayEvent(job, payload, syncId);
    if (evt) {
      return sendBatchToCloud(apiUrl, terminalId, terminalSecret, [evt], relay);
    }
    return relayApiCallForJob(relay, terminalId, terminalSecret, job, payload, syncId);
  }
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
  if (job.event_type === SYNC_EVENT_TYPES.ORDER_VOID) {
    return apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${payload.orderId}/void`, {
      method: 'POST',
      body: JSON.stringify({
        cashierId: payload.cashierId,
        managerPin: payload.managerPin,
        reason: payload.reason,
        syncId,
      }),
    });
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
  if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_CHECK_PRINT) {
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${payload.chequeId}/check-print`,
      {
        method: 'POST',
        body: JSON.stringify({ cashierId: payload.cashierId, syncId }),
      },
    );
  }
  if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_PRE_PAY_ADJUST) {
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${payload.chequeId}/orders/${payload.orderId}/items/${payload.itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          quantity: payload.quantity,
          cashierId: payload.cashierId,
          syncId,
        }),
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
  if (job.event_type === SYNC_EVENT_TYPES.SHIFT_OPEN) {
    const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/shifts/open', {
      method: 'POST',
      body: JSON.stringify({
        cashierId: payload.cashierId,
        openFloat: payload.openFloat,
        syncId,
      }),
    });
    if (payload.shiftId && result?.id) {
      return { linkLocalShift: { serverId: result.id, localId: payload.shiftId }, result };
    }
    return result;
  }
  if (job.event_type === SYNC_EVENT_TYPES.SHIFT_CLOSE) {
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/shifts/close', {
      method: 'POST',
      body: JSON.stringify({
        cashierId: payload.cashierId,
        closeFloat: payload.closeFloat,
        managerPin: payload.managerPin,
        syncId,
      }),
    });
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
  if (job.event_type === SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_REPLAY) {
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
  relay = null,
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
        await sendBatchToCloud(apiUrl, terminalId, terminalSecret, batchEvents, relay);
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
      const result = await replayJob(apiUrl, terminalId, terminalSecret, job, payload, syncId, relay);

      if (result?.linkLocalCheque) {
        db.prepare(`UPDATE cheques SET server_id = ?, synced_at = datetime('now') WHERE id = ?`).run(
          result.linkLocalCheque.serverId,
          result.linkLocalCheque.localId,
        );
      }

      if (result?.linkLocalShift) {
        linkLocalShiftServerId(db, result.linkLocalShift.localId, result.linkLocalShift.serverId);
      }

      db.prepare(`UPDATE sync_queue SET status = 'done' WHERE id = ?`).run(job.id);
      results.push({ id: job.id, status: 'done' });
    } catch (err) {
      if (isReplaySkippableError(err)) {
        db.prepare(`UPDATE sync_queue SET status = 'done' WHERE id = ?`).run(job.id);
        results.push({ id: job.id, status: 'done', skipped: true });
        continue;
      }
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
  const drainTotal = Number(
    db.prepare(`SELECT value FROM agent_meta WHERE key = 'sync_drain_total'`).get()?.value ?? 0,
  );
  const drainDone = Number(
    db.prepare(`SELECT value FROM agent_meta WHERE key = 'sync_drain_done'`).get()?.value ?? 0,
  );
  return {
    pending,
    failed,
    syncing: syncing === 'true',
    drainTotal: drainTotal || null,
    drainDone: drainDone || null,
    lastDrained: db.prepare(`SELECT value FROM agent_meta WHERE key = 'last_sync_at'`).get()?.value,
  };
}

export function setSyncDrainProgress(db, { total, done } = {}) {
  if (total != null) setAgentMeta(db, 'sync_drain_total', String(total));
  if (done != null) setAgentMeta(db, 'sync_drain_done', String(done));
}

export function clearSyncDrainProgress(db) {
  setAgentMeta(db, 'sync_drain_total', '0');
  setAgentMeta(db, 'sync_drain_done', '0');
}

export function listFailedSyncJobs(db, { limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT id, event_type, payload_json, retry_count, created_at
       FROM sync_queue WHERE status = 'failed'
       ORDER BY created_at ASC LIMIT ?`,
    )
    .all(limit)
    .map((row) => {
      let payload = {};
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        payload = {};
      }
      return {
        id: row.id,
        eventType: row.event_type,
        retryCount: row.retry_count,
        createdAt: row.created_at,
        summary: summarizeSyncPayload(row.event_type, payload),
        payload,
      };
    });
}

function summarizeSyncPayload(eventType, payload) {
  if (payload.tableLabel) return `${eventType} · ${payload.tableLabel}`;
  if (payload.chequeId) return `${eventType} · cheque ${String(payload.chequeId).slice(0, 8)}`;
  if (payload.orderId) return `${eventType} · order ${String(payload.orderId).slice(0, 8)}`;
  return eventType;
}

export function retryFailedSyncJob(db, jobId) {
  const row = db.prepare(`SELECT id FROM sync_queue WHERE id = ? AND status = 'failed'`).get(jobId);
  if (!row) return false;
  db.prepare(
    `UPDATE sync_queue SET status = 'pending', retry_count = 0 WHERE id = ?`,
  ).run(jobId);
  return true;
}

/** Move all failed jobs back to pending for background replay. */
export function requeueAllFailedSyncJobs(db) {
  const failed = db
    .prepare(`SELECT id FROM sync_queue WHERE status = 'failed' ORDER BY created_at ASC`)
    .all();
  for (const row of failed) {
    retryFailedSyncJob(db, row.id);
  }
  return failed.length;
}

export function dismissFailedSyncJob(db, jobId) {
  const result = db.prepare(`DELETE FROM sync_queue WHERE id = ? AND status = 'failed'`).run(jobId);
  return result.changes > 0;
}
