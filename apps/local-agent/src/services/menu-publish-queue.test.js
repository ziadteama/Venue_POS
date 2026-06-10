import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../db/sqlite.js';
import { drainMenuPublishQueue } from './ws-client.js';

const VENUE = '00000000-0000-4000-8000-00000000p1';

test('drainMenuPublishQueue marks pending rows done after successful menu sync', async () => {
  const db = createDatabase(':memory:');
  const id = randomUUID();
  db.prepare(
    `INSERT INTO menu_publish_queue (id, version_hash, payload_json, status) VALUES (?, 'v2', '{}', 'pending')`,
  ).run(id);

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      versionHash: 'v2',
      categories: [{ items: [{ id: 'i1', nameEn: 'A', nameAr: 'أ', price: 10 }] }],
    }),
  });

  await drainMenuPublishQueue({
    db,
    apiUrl: 'http://127.0.0.1:3000',
    venueId: VENUE,
    terminalId: 'term-1',
    terminalSecret: 'secret',
    log: { warn: () => {} },
  });

  global.fetch = originalFetch;

  const row = db.prepare(`SELECT status FROM menu_publish_queue WHERE id = ?`).get(id);
  assert.equal(row.status, 'done');
  const cached = db.prepare(`SELECT version_hash FROM menu_cache WHERE venue_id = ?`).get(VENUE);
  assert.equal(cached.version_hash, 'v2');
  db.close();
});
