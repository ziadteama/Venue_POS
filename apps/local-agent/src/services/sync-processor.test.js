import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';
import { initSchema } from '../db/schema.js';
import { enqueueSync, processSyncQueue } from './sync-processor.js';
import { getServerShiftId } from './shift-cache.js';

describe('processSyncQueue', () => {
  let db;
  let originalFetch;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('keeps job pending and increments retry_count when API returns 500', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });

    enqueueSync(db, 'order.create', { orderId: 'o1', cashierId: 'c1' });
    const results = await processSyncQueue({
      db,
      apiUrl: 'http://api',
      terminalId: 't1',
      terminalSecret: 'secret',
    });

    assert.equal(results[0].status, 'failed');
    const job = db.prepare(`SELECT status, retry_count FROM sync_queue`).get();
    assert.equal(job.status, 'pending');
    assert.equal(job.retry_count, 1);
  });

  it('replays order.patch_item with PATCH', async () => {
    let url;
    let method;
    global.fetch = async (fetchUrl, options = {}) => {
      url = fetchUrl;
      method = options.method;
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    };

    enqueueSync(db, 'order.patch_item', { orderId: 'o1', itemId: 'i1', quantity: 2 });
    const results = await processSyncQueue({
      db,
      apiUrl: 'http://api',
      terminalId: 't1',
      terminalSecret: 'secret',
    });

    assert.equal(results[0].status, 'done');
    assert.equal(method, 'PATCH');
    assert.match(url, /\/api\/v1\/orders\/o1\/items\/i1$/);
  });

  it('marks job done when API succeeds', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 201,
      json: async () => ({}),
    });

    enqueueSync(db, 'order.create', { orderId: 'o1', cashierId: 'c1' });
    const results = await processSyncQueue({
      db,
      apiUrl: 'http://api',
      terminalId: 't1',
      terminalSecret: 'secret',
    });

    assert.equal(results[0].status, 'done');
    const job = db.prepare(`SELECT status FROM sync_queue`).get();
    assert.equal(job.status, 'done');
  });

  it('replays shift.open and links local shift id to server id', async () => {
    let body;
    global.fetch = async (_url, options = {}) => {
      body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'server-shift-1', cashierId: body.cashierId }),
      };
    };

    enqueueSync(db, SYNC_EVENT_TYPES.SHIFT_OPEN, {
      cashierId: 'cashier-1',
      openFloat: 100,
      shiftId: 'local-shift-1',
    });
    const results = await processSyncQueue({
      db,
      apiUrl: 'http://api',
      terminalId: 't1',
      terminalSecret: 'secret',
    });

    assert.equal(results[0].status, 'done');
    assert.equal(body.cashierId, 'cashier-1');
    assert.equal(body.openFloat, 100);
    assert.ok(body.syncId);
    assert.equal(getServerShiftId(db, 'local-shift-1'), 'server-shift-1');
  });

  it('replays shift.close via POST /api/v1/shifts/close', async () => {
    let url;
    let body;
    global.fetch = async (fetchUrl, options = {}) => {
      url = fetchUrl;
      body = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ shift: { status: 'closed' } }) };
    };

    enqueueSync(db, SYNC_EVENT_TYPES.SHIFT_CLOSE, {
      cashierId: 'cashier-1',
      closeFloat: 150,
    });
    const results = await processSyncQueue({
      db,
      apiUrl: 'http://api',
      terminalId: 't1',
      terminalSecret: 'secret',
    });

    assert.equal(results[0].status, 'done');
    assert.match(url, /\/api\/v1\/shifts\/close$/);
    assert.equal(body.cashierId, 'cashier-1');
    assert.equal(body.closeFloat, 150);
  });
});
