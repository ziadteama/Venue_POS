/**
 * Automated coverage for the 10 manual scenarios in docs/DEVELOPMENT.md § Phase 6 manual test matrix.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SYNC_EVENT_TYPES, CLUSTER_MODES, CLUSTER_HYSTERESIS_TICKS } from '@venue-pos/shared';
import { createDatabase } from '../../src/db/sqlite.js';
import { setCloudOnline } from '../../src/services/cloud-health.js';
import { seedMenuCache, startTestAgent } from './helpers/test-agent.js';
import {
  openLocalCheque,
  fireLocalCheque,
  payLocalCheque,
  clearLocalChequeDraft,
  moveLocalChequeTable,
  transferLocalChequeItems,
  splitLocalChequeByItems,
  closeEmptyLocalCheque,
} from '../../src/services/local-cheques.js';
import { addLocalOrderItem } from '../../src/services/orders.js';
import {
  startCoordinatorGroup,
  addCoordinatorGroupItem,
  fireCoordinatorGroup,
  payCoordinatorGroup,
  newGroupId,
} from '../../src/services/coordinator-cross-venue.js';
import {
  enqueueSync,
  processSyncQueue,
  retryFailedSyncJob,
  dismissFailedSyncJob,
  listFailedSyncJobs,
  getSyncQueueDepth,
} from '../../src/services/sync-processor.js';
import { assertMenuReadyForWrite, markMenuStale } from '../../src/services/menu-gate.js';
import { computeClusterState } from '../../src/services/cluster-state.js';
import { buildAgentApp } from '../../src/server.js';

const VENUE = '00000000-0000-4000-8000-00000000f1';
const CASHIER = '00000000-0000-4000-8000-00000000f2';
const TERMINAL_A = '00000000-0000-4000-8000-00000000f3';
const TERMINAL_B = '00000000-0000-4000-8000-00000000f4';

let coordinatorApp;
let followerApp;
let coordinatorDb;
let followerDb;
let tempDir;

function pickPort() {
  return 36000 + Math.floor(Math.random() * 2000);
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'venue-pos-matrix-'));
  coordinatorDb = createDatabase(join(tempDir, 'coordinator.db'));
  followerDb = createDatabase(join(tempDir, 'follower.db'));
  seedMenuCache(coordinatorDb, VENUE);
  seedMenuCache(followerDb, VENUE);

  const coordPort = pickPort();
  coordinatorApp = await startTestAgent({
    db: coordinatorDb,
    port: coordPort,
    terminalId: TERMINAL_A,
    venueId: VENUE,
    isCoordinator: true,
  });

  followerApp = await startTestAgent({
    db: followerDb,
    port: pickPort(),
    terminalId: TERMINAL_B,
    venueId: VENUE,
    isCoordinator: false,
    coordinatorFallback: true,
    coordinatorLanHost: '127.0.0.1',
    coordinatorLanPort: coordPort,
  });
});

after(async () => {
  await coordinatorApp?.close();
  await followerApp?.close();
  coordinatorDb?.close();
  followerDb?.close();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  setCloudOnline(true);
});

describe('Phase 6 manual matrix', () => {
  test('1 — single-venue offline pay then queue drain on reconnect', async () => {
    const db = createDatabase(':memory:');
    seedMenuCache(db, VENUE);

    const cheque = openLocalCheque(db, {
      venueId: VENUE,
      terminalId: TERMINAL_A,
      cashierId: CASHIER,
      tableLabel: 'M1',
    });
    addLocalOrderItem(db, cheque.draftOrder.id, {
      menuItemId: 'item-1',
      quantity: 1,
      nameEn: 'Burger',
      nameAr: 'برجر',
      unitPrice: 50,
    });
    fireLocalCheque(db, cheque.id);
    payLocalCheque(db, cheque.id, { method: 'cash', amount: 50 });

    enqueueSync(
      db,
      SYNC_EVENT_TYPES.CHEQUE_PAY,
      { chequeId: cheque.id, payBody: { cashierId: CASHIER, method: 'cash', amount: 50 } },
      randomUUID(),
    );
    assert.equal(getSyncQueueDepth(db), 1);

    let payUrl;
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      payUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ cheque: { id: cheque.id, status: 'paid' } }),
      };
    };

    setCloudOnline(true);
    const results = await processSyncQueue({
      db,
      apiUrl: 'http://127.0.0.1:3000',
      terminalId: TERMINAL_A,
      terminalSecret: 'secret',
    });
    global.fetch = originalFetch;

    assert.equal(results[0].status, 'done');
    assert.equal(getSyncQueueDepth(db), 0);
    assert.match(payUrl, new RegExp(`/api/v1/cheques/${cheque.id}/pay$`));
    db.close();
  });

  test('2 — coordinator floor lock visible to second terminal via LAN', async () => {
    setCloudOnline(false);
    const chequeId = randomUUID();
    const occupy = await coordinatorApp.inject({
      method: 'POST',
      url: '/v1/floor/tables/occupy',
      payload: { tableLabel: 'T5', chequeId, venueId: VENUE },
    });
    assert.equal(occupy.statusCode, 200);

    const followerFloor = await followerApp.inject({
      method: 'GET',
      url: '/v1/floor/tables',
    });
    assert.equal(followerFloor.statusCode, 200);
    const rows = followerFloor.json();
    assert.ok(rows.some((r) => r.tableLabel === 'T5' && r.isOccupied));

    await coordinatorApp.inject({
      method: 'POST',
      url: '/v1/floor/tables/release',
      payload: { tableLabel: 'T5', chequeId },
    });
  });

  test('3 — cross-sell offline pay enqueues atomic group replay', () => {
    const db = createDatabase(':memory:');
    const menu = {
      venueNameEn: 'Anchor',
      categories: [{ items: [{ id: 'm1', nameEn: 'Tea', nameAr: 'شاي', price: 25 }] }],
    };
    db.prepare(
      `INSERT INTO linked_menu_cache (venue_id, version_hash, menu_json, synced_at) VALUES (?, 'v1', ?, datetime('now'))`,
    ).run(VENUE, JSON.stringify(menu));

    const groupId = newGroupId();
    startCoordinatorGroup(db, {
      groupId,
      anchorVenueId: VENUE,
      anchorTerminalId: TERMINAL_A,
      cashierId: CASHIER,
      tableLabel: 'CV1',
    });
    addCoordinatorGroupItem(db, groupId, { venueId: VENUE, menuItemId: 'm1', quantity: 2 });
    fireCoordinatorGroup(db, groupId, {});
    const paid = payCoordinatorGroup(db, groupId, { cashierId: CASHIER, method: 'cash' });

    enqueueSync(db, SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_REPLAY, paid.replayPayload, groupId);
    const job = db
      .prepare(`SELECT event_type, payload_json FROM sync_queue WHERE id = ?`)
      .get(groupId);
    assert.equal(job.event_type, SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_REPLAY);
    const payload = JSON.parse(job.payload_json);
    assert.equal(payload.groupId, groupId);
    assert.equal(payload.pay, true);
    db.close();
  });

  test('4 — manager ops offline (clear, move, transfer, split, void empty)', () => {
    const db = createDatabase(':memory:');

    const cheque = openLocalCheque(db, {
      venueId: VENUE,
      terminalId: TERMINAL_A,
      cashierId: CASHIER,
      tableLabel: 'MO1',
    });
    addLocalOrderItem(db, cheque.draftOrder.id, {
      menuItemId: 'item-1',
      quantity: 1,
      nameEn: 'A',
      nameAr: 'أ',
      unitPrice: 40,
    });
    clearLocalChequeDraft(db, cheque.id);

    const moved = moveLocalChequeTable(db, cheque.id, 'MO2', VENUE);
    assert.equal(moved.cheque.tableLabel, 'MO2');

    addLocalOrderItem(db, moved.cheque.draftOrder.id, {
      menuItemId: 'item-1',
      quantity: 1,
      nameEn: 'B',
      nameAr: 'ب',
      unitPrice: 30,
    });
    const fired = fireLocalCheque(db, cheque.id);
    const itemId = fired.sentOrder.items[0].id;

    const transferred = transferLocalChequeItems(
      db,
      cheque.id,
      { itemIds: [itemId], targetTableLabel: 'MO3', cashierId: CASHIER },
      VENUE,
      TERMINAL_A,
    );
    assert.equal(transferred.target.tableLabel, 'MO3');

    const splitSource = openLocalCheque(db, {
      venueId: VENUE,
      terminalId: TERMINAL_A,
      cashierId: CASHIER,
      tableLabel: 'MO4',
    });
    addLocalOrderItem(db, splitSource.draftOrder.id, {
      menuItemId: 'item-1',
      quantity: 1,
      nameEn: 'C',
      nameAr: 'ج',
      unitPrice: 20,
    });
    const splitFired = fireLocalCheque(db, splitSource.id);
    const splitItemId = splitFired.sentOrder.items[0].id;
    splitLocalChequeByItems(
      db,
      splitSource.id,
      { splits: [{ label: 'Guest', itemIds: [splitItemId] }] },
      VENUE,
    );

    const empty = openLocalCheque(db, {
      venueId: VENUE,
      terminalId: TERMINAL_A,
      cashierId: CASHIER,
      tableLabel: 'MO5',
    });
    const removed = closeEmptyLocalCheque(db, empty.id, VENUE);
    assert.equal(removed.deleted, true);
    db.close();
  });

  test('5 — refund blocked offline with clear message', async () => {
    const db = createDatabase(':memory:');
    setCloudOnline(false);
    const app = await buildAgentApp({
      db,
      config: {
        port: 0,
        host: '127.0.0.1',
        apiUrl: 'http://127.0.0.1:9',
        venueId: VENUE,
        terminalId: TERMINAL_A,
        terminalSecret: 'secret',
        corsOrigins: ['*'],
        getPrinterConfig: () => ({}),
        autoReceiptPrint: false,
        isCoordinator: false,
        coordinatorFallback: false,
        getClusterState: () => ({}),
        lanPort: 3456,
        lanSecret: '',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/cheques/${randomUUID()}/refund`,
      payload: { cashierId: CASHIER, amount: 10, reason: 'test' },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'OFFLINE_MODE');
    assert.match(res.json().error.message, /hub connection/i);
    await app.close();
    db.close();
  });

  test('6 — failed sync review retry and dismiss', async () => {
    const db = createDatabase(':memory:');
    const jobId = enqueueSync(db, SYNC_EVENT_TYPES.CHEQUE_OPEN, {
      cashierId: CASHIER,
      tableLabel: 'BAD',
    });
    db.prepare(`UPDATE sync_queue SET status = 'failed', retry_count = 3 WHERE id = ?`).run(jobId);

    assert.equal(listFailedSyncJobs(db).length, 1);
    assert.ok(retryFailedSyncJob(db, jobId));
    assert.equal(
      db.prepare(`SELECT status FROM sync_queue WHERE id = ?`).get(jobId).status,
      'pending',
    );

    db.prepare(`UPDATE sync_queue SET status = 'failed' WHERE id = ?`).run(jobId);
    assert.ok(dismissFailedSyncJob(db, jobId));
    assert.equal(listFailedSyncJobs(db).length, 0);
    db.close();
  });

  test('7 — menu stale gate blocks new orders until sync', () => {
    const db = createDatabase(':memory:');
    seedMenuCache(db, VENUE);
    setCloudOnline(true);
    markMenuStale(db, true);

    assert.throws(
      () => assertMenuReadyForWrite(db, VENUE),
      (err) => err.code === 'MENU_STALE',
    );

    markMenuStale(db, false);
    assert.doesNotThrow(() => assertMenuReadyForWrite(db, VENUE));
    db.close();
  });

  test('8 — power-loss: WAL db preserves open cheque and sync queue', () => {
    const dbPath = join(tempDir, 'power-loss.db');
    const db1 = createDatabase(dbPath);
    seedMenuCache(db1, VENUE);
    const cheque = openLocalCheque(db1, {
      venueId: VENUE,
      terminalId: TERMINAL_A,
      cashierId: CASHIER,
      tableLabel: 'PL1',
    });
    addLocalOrderItem(db1, cheque.draftOrder.id, {
      menuItemId: 'item-1',
      quantity: 2,
      nameEn: 'X',
      nameAr: 'س',
      unitPrice: 15,
    });
    enqueueSync(db1, SYNC_EVENT_TYPES.CHEQUE_FIRE, { chequeId: cheque.id }, randomUUID());
    db1.close();

    const db2 = createDatabase(dbPath);
    const openRow = db2
      .prepare(`SELECT id FROM cheques WHERE table_label = 'PL1' AND status = 'open'`)
      .get();
    assert.ok(openRow);
    const pending = db2.prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`).get()
      .n;
    assert.equal(pending, 1);
    const items = db2
      .prepare(`SELECT quantity FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.cheque_id = ?`)
      .all(openRow.id);
    assert.equal(items[0].quantity, 2);
    db2.close();
  });

  test('9 — cloud flap hysteresis holds stable mode', () => {
    const flapOffline = computeClusterState({
      cloudOnline: false,
      terminalId: TERMINAL_A,
      agentPriority: 100,
      peers: [],
      previous: {
        mode: CLUSTER_MODES.DIRECT,
        stableMode: CLUSTER_MODES.DIRECT,
        pendingMode: CLUSTER_MODES.DIRECT,
        ticks: 2,
      },
    });
    assert.equal(flapOffline.mode, CLUSTER_MODES.DIRECT, 'first offline tick keeps prior stable mode');

    const flapOnline = computeClusterState({
      cloudOnline: true,
      terminalId: TERMINAL_A,
      agentPriority: 100,
      peers: [],
      previous: {
        mode: CLUSTER_MODES.LEADER,
        stableMode: CLUSTER_MODES.LEADER,
        pendingMode: CLUSTER_MODES.LEADER,
        ticks: 2,
      },
    });
    assert.equal(flapOnline.mode, CLUSTER_MODES.LEADER, 'first online tick keeps prior stable mode');

    const stableOnline = computeClusterState({
      cloudOnline: true,
      terminalId: TERMINAL_A,
      agentPriority: 100,
      peers: [],
      previous: {
        mode: CLUSTER_MODES.LEADER,
        stableMode: CLUSTER_MODES.LEADER,
        pendingMode: CLUSTER_MODES.DIRECT,
        ticks: CLUSTER_HYSTERESIS_TICKS,
      },
    });
    assert.equal(stableOnline.mode, CLUSTER_MODES.DIRECT);
  });

  test('10 — duplicate syncId cannot enqueue twice (idempotency key)', () => {
    const db = createDatabase(':memory:');
    const syncId = randomUUID();
    enqueueSync(db, SYNC_EVENT_TYPES.CHEQUE_OPEN, { cashierId: CASHIER, tableLabel: 'DUP' }, syncId);
    assert.throws(
      () => enqueueSync(db, SYNC_EVENT_TYPES.CHEQUE_PAY, { chequeId: 'x' }, syncId),
      /UNIQUE constraint failed/i,
    );
    db.close();
  });
});
