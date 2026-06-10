import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../db/sqlite.js';
import { setCloudOnline } from './cloud-health.js';
import { assertMenuReadyForWrite, markMenuStale } from './menu-gate.js';

const VENUE = '00000000-0000-4000-8000-00000000g1';

test('menu gate blocks writes when cache empty', () => {
  const db = createDatabase(':memory:');
  setCloudOnline(true);
  assert.throws(
    () => assertMenuReadyForWrite(db, VENUE),
    (err) => err.code === 'MENU_NOT_CACHED',
  );
  db.close();
});

test('menu gate blocks writes when stale flag set online', () => {
  const db = createDatabase(':memory:');
  const menu = { categories: [{ items: [{ id: 'i1', price: 10 }] }] };
  db.prepare(
    `INSERT INTO menu_cache (venue_id, version_hash, menu_json, synced_at) VALUES (?, 'v1', ?, datetime('now'))`,
  ).run(VENUE, JSON.stringify(menu));
  setCloudOnline(true);
  markMenuStale(db, true);
  assert.throws(
    () => assertMenuReadyForWrite(db, VENUE),
    (err) => err.code === 'MENU_STALE',
  );
  db.close();
});
