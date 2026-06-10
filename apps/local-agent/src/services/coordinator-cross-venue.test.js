import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../db/sqlite.js';
import {
  startCoordinatorGroup,
  addCoordinatorGroupItem,
  fireCoordinatorGroup,
  payCoordinatorGroup,
  newGroupId,
} from './coordinator-cross-venue.js';

const ANCHOR = '00000000-0000-4000-8000-0000000000b1';
const TARGET = '00000000-0000-4000-8000-0000000000b2';
const CASHIER = '00000000-0000-4000-8000-0000000000b3';

let db;

before(() => {
  db = createDatabase(':memory:');
  const menu = {
    venueId: ANCHOR,
    venueNameEn: 'Cafe',
    venueNameAr: 'مقهى',
    categories: [{ items: [{ id: 'm1', nameEn: 'Coffee', nameAr: 'قهوة', price: 40 }] }],
  };
  const targetMenu = {
    venueId: TARGET,
    venueNameEn: 'Bakery',
    venueNameAr: 'مخبز',
    categories: [{ items: [{ id: 'm2', nameEn: 'Cake', nameAr: 'كيك', price: 60 }] }],
  };
  db.prepare(
    `INSERT INTO linked_menu_cache (venue_id, version_hash, menu_json, synced_at) VALUES (?, 'v1', ?, datetime('now'))`,
  ).run(ANCHOR, JSON.stringify(menu));
  db.prepare(
    `INSERT INTO linked_menu_cache (venue_id, version_hash, menu_json, synced_at) VALUES (?, 'v1', ?, datetime('now'))`,
  ).run(TARGET, JSON.stringify(targetMenu));
});

after(() => {
  db?.close();
});

test('coordinator cross-venue lifecycle offline', () => {
  const groupId = newGroupId();
  startCoordinatorGroup(db, {
    groupId,
    anchorVenueId: ANCHOR,
    anchorTerminalId: 'term-1',
    cashierId: CASHIER,
    tableLabel: 'T5',
  });

  addCoordinatorGroupItem(db, groupId, {
    venueId: ANCHOR,
    menuItemId: 'm1',
    quantity: 2,
  });
  addCoordinatorGroupItem(db, groupId, {
    venueId: TARGET,
    menuItemId: 'm2',
    quantity: 1,
  });

  const fired = fireCoordinatorGroup(db, groupId, {});
  assert.ok(fired.sentOrders.length >= 1);

  const paid = payCoordinatorGroup(db, groupId, {
    cashierId: CASHIER,
    method: 'cash',
  });
  assert.equal(paid.combinedTotal, 140);
  assert.ok(paid.replayPayload.groupId);
  assert.equal(paid.replayPayload.pay, true);
});
