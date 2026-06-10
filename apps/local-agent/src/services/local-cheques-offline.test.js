import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../db/sqlite.js';
import {
  openLocalCheque,
  clearLocalChequeDraft,
  closeEmptyLocalCheque,
  moveLocalChequeTable,
  fireLocalCheque,
  splitLocalChequeByItems,
  listLocalPaidCheques,
} from './local-cheques.js';
import { addLocalOrderItem } from './orders.js';

const VENUE = '00000000-0000-4000-8000-0000000000a1';
const CASHIER = '00000000-0000-4000-8000-0000000000a2';
const TERMINAL = '00000000-0000-4000-8000-0000000000a3';

let db;

before(() => {
  db = createDatabase(':memory:');
});

after(() => {
  db?.close();
});

test('clear draft and close empty cheque offline', () => {
  const cheque = openLocalCheque(db, {
    venueId: VENUE,
    terminalId: TERMINAL,
    cashierId: CASHIER,
    tableLabel: 'T1',
  });
  const draftId = cheque.draftOrder.id;
  addLocalOrderItem(db, draftId, {
    menuItemId: 'item-1',
    quantity: 1,
    nameEn: 'Burger',
    nameAr: 'برجر',
    unitPrice: 50,
  });
  clearLocalChequeDraft(db, cheque.id);
  const afterClear = openLocalCheque(db, {
    venueId: VENUE,
    terminalId: TERMINAL,
    cashierId: CASHIER,
    tableLabel: 'T2',
  });
  addLocalOrderItem(db, afterClear.draftOrder.id, {
    menuItemId: 'item-2',
    quantity: 1,
    nameEn: 'Fries',
    nameAr: 'بطاطس',
    unitPrice: 20,
  });
  assert.throws(() => closeEmptyLocalCheque(db, afterClear.id, VENUE));

  clearLocalChequeDraft(db, afterClear.id);
  const removed = closeEmptyLocalCheque(db, afterClear.id, VENUE);
  assert.equal(removed.deleted, true);
});

test('move table offline', () => {
  const cheque = openLocalCheque(db, {
    venueId: VENUE,
    terminalId: TERMINAL,
    cashierId: CASHIER,
    tableLabel: 'T10',
  });
  const moved = moveLocalChequeTable(db, cheque.id, 'T11', VENUE);
  assert.equal(moved.cheque.tableLabel, 'T11');
  assert.equal(moved.oldTableLabel, 'T10');
});

test('split by items offline', () => {
  const cheque = openLocalCheque(db, {
    venueId: VENUE,
    terminalId: TERMINAL,
    cashierId: CASHIER,
    tableLabel: 'S1',
  });
  addLocalOrderItem(db, cheque.draftOrder.id, {
    menuItemId: 'item-a',
    quantity: 1,
    nameEn: 'A',
    nameAr: 'أ',
    unitPrice: 30,
  });
  const fired = fireLocalCheque(db, cheque.id);
  const itemId = fired.sentOrder.items[0].id;
  splitLocalChequeByItems(db, cheque.id, { splits: [{ label: 'Guest A', itemIds: [itemId] }] }, VENUE);
  const child = db.prepare(`SELECT id FROM cheques WHERE parent_cheque_id = ?`).get(cheque.id);
  assert.ok(child);
});

test('list paid cheques offline', () => {
  const rows = listLocalPaidCheques(db, VENUE, 10);
  assert.ok(Array.isArray(rows));
});
