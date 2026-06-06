import { randomUUID } from 'node:crypto';
import { apiFetch } from './api-fetch.js';

export async function processSyncQueue({ db, apiUrl, terminalId, terminalSecret }) {
  const pending = db
    .prepare(`SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20`)
    .all();

  const results = [];
  for (const job of pending) {
    try {
      const payload = JSON.parse(job.payload_json);
      if (job.event_type === 'order.create') {
        await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/orders', {
          method: 'POST',
          body: JSON.stringify({
            id: payload.orderId,
            cashierId: payload.cashierId,
            tableLabel: payload.tableLabel,
          }),
        });
      } else if (job.event_type === 'order.add_item') {
        await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${payload.orderId}/items`, {
          method: 'POST',
          body: JSON.stringify({
            menuItemId: payload.menuItemId,
            quantity: payload.quantity,
            modifiers: payload.modifiers,
          }),
        });
      } else if (job.event_type === 'order.send') {
        await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${payload.orderId}/send`, {
          method: 'POST',
        });
      }
      db.prepare(`UPDATE sync_queue SET status = 'done' WHERE id = ?`).run(job.id);
      results.push({ id: job.id, status: 'done' });
    } catch (err) {
      db.prepare(`UPDATE sync_queue SET retry_count = retry_count + 1 WHERE id = ?`).run(job.id);
      results.push({ id: job.id, status: 'failed', error: err.message });
    }
  }
  return results;
}

export function enqueueSync(db, eventType, payload) {
  db.prepare(
    `INSERT INTO sync_queue (id, event_type, payload_json, status) VALUES (?, ?, ?, 'pending')`,
  ).run(randomUUID(), eventType, JSON.stringify(payload));
}
