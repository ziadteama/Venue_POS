import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { hashSecret } from './services/auth-service.js';
import { withSyncIdempotency } from './services/sync-idempotency.js';
import { duplicateSyncIdError } from './services/sync-idempotency.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000097';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000097';
const TERMINAL_SECRET = 'phase6-test-secret';
const CASHIER_ID = '00000000-0000-4000-8000-000000000097';

const terminalHeaders = {
  'x-terminal-id': TERMINAL_ID,
  'x-terminal-secret': TERMINAL_SECRET,
};

let app;

before(async () => {
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }) };
  await app.ready();

  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    create: {
      id: VENUE_ID,
      nameEn: 'Phase6 Test Venue',
      nameAr: 'اختبار',
      tables: ['T1', 'T2', 'T5'],
    },
    update: { tables: ['T1', 'T2', 'T5'] },
  });

  await prisma.user.upsert({
    where: { id: CASHIER_ID },
    create: {
      id: CASHIER_ID,
      username: 'phase6cashier',
      role: 'cashier',
      venueId: VENUE_ID,
      pinHash,
      isActive: true,
    },
    update: { pinHash, isActive: true, venueId: VENUE_ID, role: 'cashier' },
  });

  const secretHash = await hashSecret(TERMINAL_SECRET);
  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    create: {
      id: TERMINAL_ID,
      name: 'Phase6 POS',
      venueId: VENUE_ID,
      secretHash,
      isActive: true,
    },
    update: { secretHash, isActive: true, venueId: VENUE_ID },
  });
});

after(async () => {
  await prisma.syncEvent.deleteMany({ where: { terminalId: TERMINAL_ID } });
  await prisma.floorTable.deleteMany({});
  await app.close();
});

test('terminal roster returns staff pin hashes for offline cache', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/terminals/roster',
    headers: terminalHeaders,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.staff));
  assert.ok(body.staff.length > 0, 'expected at least one staff member');
  assert.ok(body.staff.every((s) => s.pinHash), 'staff should include pinHash for offline cache');
  assert.ok(body.features);
});

test('terminal reconnect handshake returns menu stale hint', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/terminals/reconnect',
    headers: terminalHeaders,
    payload: { menuVersionHash: 'stale-hash-value' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok('menuStale' in body);
  assert.ok(Array.isArray(body.staff));
});

test('floor table occupy is hub-scoped', async () => {
  const occupy = await app.inject({
    method: 'POST',
    url: '/api/v1/floor/tables/occupy',
    headers: terminalHeaders,
    payload: { tableLabel: 'T5', chequeId: '00000000-0000-4000-8000-000000000099' },
  });
  assert.equal(occupy.statusCode, 200);

  const list = await app.inject({
    method: 'GET',
    url: '/api/v1/floor/tables',
    headers: terminalHeaders,
  });
  assert.equal(list.statusCode, 200);
  const rows = list.json();
  assert.ok(rows.some((r) => r.tableLabel === 'T5' && r.isOccupied));
});

test('duplicate syncId returns conflict on replay', async () => {
  const syncId = '00000000-0000-4000-8000-000000000098';
  let calls = 0;
  await withSyncIdempotency(
    { syncId, terminalId: TERMINAL_ID, eventType: 'cheque.open' },
    async () => {
      calls += 1;
      return { ok: true };
    },
  );
  await assert.rejects(
    () =>
      withSyncIdempotency(
        { syncId, terminalId: TERMINAL_ID, eventType: 'cheque.open' },
        async () => {
          calls += 1;
          return { ok: true };
        },
      ),
    (err) => err.code === duplicateSyncIdError().code,
  );
  assert.equal(calls, 1);
});
