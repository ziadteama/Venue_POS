import { randomUUID } from 'node:crypto';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';
import { apiFetch } from './api-fetch.js';

export async function processSyncQueue({ db, apiUrl, terminalId, terminalSecret }) {
  const pending = db
    .prepare(`SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20`)
    .all();

  const results = [];
  for (const job of pending) {
    try {
      const payload = JSON.parse(job.payload_json);
      const syncId = payload.syncId ?? job.id;

      if (job.event_type === SYNC_EVENT_TYPES.ORDER_CREATE) {
        await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/orders', {
          method: 'POST',
          body: JSON.stringify({
            id: payload.orderId,
            cashierId: payload.cashierId,
            tableLabel: payload.tableLabel,
            syncId,
          }),
        });
      } else if (job.event_type === SYNC_EVENT_TYPES.ORDER_ADD_ITEM) {
        await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${payload.orderId}/items`, {
          method: 'POST',
          body: JSON.stringify({
            menuItemId: payload.menuItemId,
            quantity: payload.quantity,
            modifiers: payload.modifiers,
            syncId,
          }),
        });
      } else if (job.event_type === SYNC_EVENT_TYPES.ORDER_SEND) {
        await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${payload.orderId}/send`, {
          method: 'POST',
          body: JSON.stringify({ syncId }),
        });
      } else if (job.event_type === SYNC_EVENT_TYPES.ORDER_PATCH_ITEM) {
        await apiFetch(
          apiUrl,
          terminalId,
          terminalSecret,
          `/api/v1/orders/${payload.orderId}/items/${payload.itemId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ quantity: payload.quantity, syncId }),
          },
        );
      } else if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_OPEN) {
        const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open', {
          method: 'POST',
          body: JSON.stringify({
            cashierId: payload.cashierId,
            tableLabel: payload.tableLabel,
            syncId,
          }),
        });
        if (payload.chequeId && result?.id) {
          db.prepare(`UPDATE cheques SET server_id = ?, synced_at = datetime('now') WHERE id = ?`).run(
            result.id,
            payload.chequeId,
          );
        }
      } else if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_FIRE) {
        await apiFetch(
          apiUrl,
          terminalId,
          terminalSecret,
          `/api/v1/cheques/${payload.chequeId}/fire`,
          { method: 'POST', body: JSON.stringify({ syncId }) },
        );
      } else if (job.event_type === SYNC_EVENT_TYPES.CHEQUE_PAY) {
        await apiFetch(
          apiUrl,
          terminalId,
          terminalSecret,
          `/api/v1/cheques/${payload.chequeId}/pay`,
          {
            method: 'POST',
            body: JSON.stringify({ ...payload.payBody, syncId }),
          },
        );
      } else if (job.event_type === SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_PAY) {
        await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/sync/events', {
          method: 'POST',
          body: JSON.stringify({
            events: [
              {
                syncId,
                eventType: job.event_type,
                payload,
              },
            ],
          }),
        });
      }

      db.prepare(`UPDATE sync_queue SET status = 'done' WHERE id = ?`).run(job.id);
      results.push({ id: job.id, status: 'done' });
    } catch (err) {
      const retries =
        db.prepare(`SELECT retry_count FROM sync_queue WHERE id = ?`).get(job.id)?.retry_count ?? 0;
      const nextStatus = retries + 1 >= 10 ? 'failed' : 'pending';
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
