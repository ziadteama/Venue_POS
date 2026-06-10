import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../db/sqlite.js';
import { setCloudOnline } from './cloud-health.js';
import { enqueueSync } from './sync-processor.js';
import { runSyncBackgroundRetry } from './sync-retry-worker.js';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';

test('runSyncBackgroundRetry re-queues failed jobs when online', async () => {
  const db = createDatabase(':memory:');
  setCloudOnline(true);
  const id = enqueueSync(db, SYNC_EVENT_TYPES.CHEQUE_OPEN, {
    cashierId: 'c1',
    tableLabel: 'T1',
  });
  db.prepare(`UPDATE sync_queue SET status = 'failed', retry_count = 10 WHERE id = ?`).run(id);

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).includes('/api/v1/cheques/open')) {
      return { ok: true, status: 200, json: async () => ({ id: 'srv-1' }) };
    }
    if (String(url).includes('/api/v1/sync/events')) {
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  };

  const result = await runSyncBackgroundRetry({
    db,
    apiUrl: 'http://127.0.0.1:3000',
    terminalId: 'term-1',
    terminalSecret: 'secret',
    log: { info: () => {}, warn: () => {} },
  });

  global.fetch = originalFetch;

  assert.equal(result.ok, true);
  const row = db.prepare(`SELECT status FROM sync_queue WHERE id = ?`).get(id);
  assert.equal(row.status, 'done');
  db.close();
});

test('runSyncBackgroundRetry skips while offline without relay', async () => {
  const db = createDatabase(':memory:');
  setCloudOnline(false);
  enqueueSync(db, SYNC_EVENT_TYPES.CHEQUE_OPEN, { cashierId: 'c1', tableLabel: 'T1' });
  const result = await runSyncBackgroundRetry({
    db,
    apiUrl: 'http://127.0.0.1:3000',
    terminalId: 'term-1',
    terminalSecret: 'secret',
    log: { warn: () => {} },
  });
  assert.equal(result.skipped, 'offline');
  db.close();
});
