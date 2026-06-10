import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../db/sqlite.js';
import { openLocalCheque } from './local-cheques.js';
import { addLocalOrderItem } from './orders.js';
import { reconcileLocalChequePrices } from './menu-reconcile.js';

const VENUE = '00000000-0000-4000-8000-0000000000c1';

let db;

before(() => {
  db = createDatabase(':memory:');
  const menu = {
    categories: [{ items: [{ id: 'item-1', price: 99 }] }],
  };
  db.prepare(
    `INSERT INTO menu_cache (venue_id, version_hash, menu_json, synced_at) VALUES (?, 'v2', ?, datetime('now'))`,
  ).run(VENUE, JSON.stringify(menu));
});

after(() => {
  db?.close();
});

test('reconcile updates stale unit prices before replay', () => {
  const cheque = openLocalCheque(db, {
    venueId: VENUE,
    cashierId: 'c1',
    tableLabel: 'T1',
  });
  addLocalOrderItem(db, cheque.draftOrder.id, {
    menuItemId: 'item-1',
    quantity: 1,
    nameEn: 'X',
    nameAr: 'X',
    unitPrice: 50,
  });
  const result = reconcileLocalChequePrices(db, VENUE);
  assert.equal(result.updated, 1);
  const item = db
    .prepare(`SELECT unit_price FROM order_items WHERE order_id = ?`)
    .get(cheque.draftOrder.id);
  assert.equal(item.unit_price, 99);
});
