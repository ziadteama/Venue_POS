import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { enqueueSync, processSyncQueue } from './sync-processor.js';

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
});
