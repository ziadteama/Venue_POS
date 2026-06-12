import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../db/sqlite.js';
import { setCloudOnline } from './cloud-health.js';
import { runMenuBackgroundSync, menuBackgroundSyncNeeded } from './menu-sync-worker.js';

const VENUE = '00000000-0000-4000-8000-00000000p1';

test('menuBackgroundSyncNeeded when queue pending or cache empty', () => {
  const db = createDatabase(':memory:');
  assert.equal(menuBackgroundSyncNeeded(db, VENUE), true);

  db.prepare(
    `INSERT INTO menu_cache (venue_id, version_hash, menu_json, synced_at) VALUES (?, 'v1', ?, datetime('now'))`,
  ).run(VENUE, JSON.stringify({ categories: [{ items: [{ id: 'i1' }] }] }));
  assert.equal(menuBackgroundSyncNeeded(db, VENUE), false);

  db.prepare(
    `INSERT INTO menu_publish_queue (id, version_hash, payload_json, status) VALUES ('q1', 'v2', '{}', 'pending')`,
  ).run();
  assert.equal(menuBackgroundSyncNeeded(db, VENUE), true);
  db.close();
});

test('runMenuBackgroundSync skips while offline', async () => {
  const db = createDatabase(':memory:');
  setCloudOnline(false);
  const result = await runMenuBackgroundSync({
    db,
    apiUrl: 'http://127.0.0.1:3000',
    venueId: VENUE,
    terminalId: 't1',
    terminalSecret: 'secret',
    log: { warn: () => {}, info: () => {} },
  });
  assert.equal(result.skipped, 'offline');
  db.close();
});

test('runMenuBackgroundSync drains queue on success', async () => {
  const db = createDatabase(':memory:');
  setCloudOnline(true);
  db.prepare(
    `INSERT INTO menu_publish_queue (id, version_hash, payload_json, status) VALUES ('q1', 'v2', '{}', 'pending')`,
  ).run();

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      versionHash: 'v2',
      categories: [{ items: [{ id: 'i1', nameEn: 'A', nameAr: 'أ', price: 10 }] }],
    }),
  });

  const result = await runMenuBackgroundSync({
    db,
    apiUrl: 'http://127.0.0.1:3000',
    venueId: VENUE,
    terminalId: 't1',
    terminalSecret: 'secret',
    log: { warn: () => {}, info: () => {} },
  });

  global.fetch = originalFetch;

  assert.equal(result.ok, true);
  const row = db.prepare(`SELECT status FROM menu_publish_queue WHERE id = 'q1'`).get();
  assert.equal(row.status, 'done');
  db.close();
});

test('runMenuBackgroundSync force fetches when cache populated', async () => {
  const db = createDatabase(':memory:');
  setCloudOnline(true);
  db.prepare(
    `INSERT INTO menu_cache (venue_id, version_hash, menu_json, synced_at) VALUES (?, 'v1', ?, datetime('now'))`,
  ).run(VENUE, JSON.stringify({ categories: [{ items: [{ id: 'i1' }] }] }));

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      versionHash: 'v2',
      categories: [{ items: [{ id: 'i1', nameEn: 'A', nameAr: 'أ', price: 10 }] }],
    }),
  });

  const result = await runMenuBackgroundSync({
    db,
    apiUrl: 'http://127.0.0.1:3000',
    venueId: VENUE,
    terminalId: 't1',
    terminalSecret: 'secret',
    log: { warn: () => {}, info: () => {} },
    force: true,
  });

  global.fetch = originalFetch;

  assert.equal(result.ok, true);
  assert.equal(result.updated, true);
  const row = db.prepare(`SELECT version_hash FROM menu_cache WHERE venue_id = ?`).get(VENUE);
  assert.equal(row.version_hash, 'v2');
  db.close();
});
