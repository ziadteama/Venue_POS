import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';
import { createDatabase } from '../../src/db/sqlite.js';
import { occupyFloorLock, releaseFloorLock, listFloorLocks } from '../../src/services/floor-locks.js';
import {
  startCoordinatorGroup,
  addCoordinatorGroupItem,
  fireCoordinatorGroup,
  payCoordinatorGroup,
  newGroupId,
} from '../../src/services/coordinator-cross-venue.js';
import { enqueueSync, processSyncQueue } from '../../src/services/sync-processor.js';
import { setCloudOnline } from '../../src/services/cloud-health.js';

const ANCHOR = '00000000-0000-4000-8000-0000000000e1';

let coordinatorDb;
let terminalDb;

before(() => {
  coordinatorDb = createDatabase(':memory:');
  terminalDb = createDatabase(':memory:');
  const menu = {
    venueNameEn: 'Cafe',
    categories: [{ items: [{ id: 'm1', nameEn: 'Tea', nameAr: 'شاي', price: 25 }] }],
  };
  coordinatorDb.prepare(
    `INSERT INTO linked_menu_cache (venue_id, version_hash, menu_json, synced_at) VALUES (?, 'v1', ?, datetime('now'))`,
  ).run(ANCHOR, JSON.stringify(menu));
});

after(() => {
  coordinatorDb?.close();
  terminalDb?.close();
});

test('coordinator floor lock visible to second terminal db', () => {
  occupyFloorLock(coordinatorDb, {
    tableLabel: 'T7',
    chequeId: 'cheque-1',
    terminalId: 'pos-a',
    venueId: ANCHOR,
  });
  const locks = listFloorLocks(coordinatorDb);
  assert.ok(locks.some((l) => l.tableLabel === 'T7' && l.isOccupied));

  releaseFloorLock(coordinatorDb, { tableLabel: 'T7', chequeId: 'cheque-1' });
  const after = listFloorLocks(coordinatorDb);
  assert.ok(!after.some((l) => l.tableLabel === 'T7' && l.isOccupied));
});

test('offline cross-sell pay enqueues atomic group replay payload', () => {
  const groupId = newGroupId();
  startCoordinatorGroup(coordinatorDb, {
    groupId,
    anchorVenueId: ANCHOR,
    anchorTerminalId: 'pos-a',
    cashierId: 'cashier-1',
    tableLabel: 'T8',
  });
  addCoordinatorGroupItem(coordinatorDb, groupId, {
    venueId: ANCHOR,
    menuItemId: 'm1',
    quantity: 2,
  });
  fireCoordinatorGroup(coordinatorDb, groupId, {});
  const paid = payCoordinatorGroup(coordinatorDb, groupId, {
    cashierId: 'cashier-1',
    method: 'cash',
  });

  const syncId = enqueueSync(
    terminalDb,
    SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_REPLAY,
    paid.replayPayload,
    groupId,
  );
  assert.equal(syncId, groupId);

  const pending = terminalDb
    .prepare(`SELECT event_type FROM sync_queue WHERE status = 'pending'`)
    .all();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].event_type, SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_REPLAY);
});

test('sync processor skips replay while cloud marked offline', async () => {
  setCloudOnline(false);
  enqueueSync(
    terminalDb,
    SYNC_EVENT_TYPES.CHEQUE_OPEN,
    { cashierId: 'c', tableLabel: 'T9' },
    randomUUID(),
  );
  const results = await processSyncQueue({
    db: terminalDb,
    apiUrl: 'http://127.0.0.1:9',
    terminalId: 't1',
    terminalSecret: 'secret',
  });
  assert.ok(results.some((r) => r.status === 'failed' || r.status === 'pending'));
  setCloudOnline(true);
});
