import { randomUUID } from 'node:crypto';
import { setAgentMeta } from './terminal-cache.js';

export function pendingPublishCount(db) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM menu_publish_queue WHERE status = 'pending'`)
    .get().n;
}

export function enqueueMenuPublish(db, payload) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO menu_publish_queue (id, version_hash, payload_json, status)
     VALUES (?, ?, ?, 'pending')`,
  ).run(id, payload.versionHash ?? '', JSON.stringify(payload));
}

/** Mark pending publish rows drained after a successful menu sync. */
export function markMenuPublishQueueDrained(db) {
  db.prepare(`UPDATE menu_publish_queue SET status = 'done' WHERE status = 'pending'`).run();
  setAgentMeta(db, 'menu_stale', 'false');
}
