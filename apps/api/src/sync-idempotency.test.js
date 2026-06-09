import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { hashSecret } from './services/auth-service.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000096';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000096';
const TERMINAL_SECRET = 'sync-test-secret';
const CASHIER_ID = '00000000-0000-4000-8000-000000000096';

let app;

before(async () => {
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }), emit: () => {} };
  await app.ready();

  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    create: {
      id: VENUE_ID,
      nameEn: 'Sync Test Venue',
      nameAr: 'مزامنة',
      tables: ['T1', 'T2'],
    },
    update: { tables: ['T1', 'T2'] },
  });
  await prisma.user.upsert({
    where: { id: CASHIER_ID },
    create: {
      id: CASHIER_ID,
      username: 'sync_cashier',
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
    },
    update: { venueId: VENUE_ID, isActive: true },
  });
  const secretHash = await hashSecret(TERMINAL_SECRET);
  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    create: {
      id: TERMINAL_ID,
      venueId: VENUE_ID,
      name: 'Sync Test POS',
      secretHash,
    },
    update: { isActive: true, secretHash, venueId: VENUE_ID },
  });
});

after(async () => {
  await app.close();
});

test('replay same syncId on cheque open returns cached result without duplicate', async () => {
  const syncId = crypto.randomUUID();
  const tableLabel = 'T2';

  await prisma.cheque.updateMany({
    where: { venueId: VENUE_ID, tableLabel, status: 'open' },
    data: { status: 'voided', closedAt: new Date() },
  });

  const first = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: {
      'x-terminal-id': TERMINAL_ID,
      'x-terminal-secret': TERMINAL_SECRET,
    },
    payload: { cashierId: CASHIER_ID, tableLabel, syncId },
  });
  assert.equal(first.statusCode, 200, first.body);
  const chequeId = first.json().id;
  const stored = await prisma.syncEvent.findUnique({ where: { syncId } });
  assert.ok(stored, 'sync event should be recorded');
  assert.ok(stored.resultJson, 'sync result should be stored');

  const second = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: {
      'x-terminal-id': TERMINAL_ID,
      'x-terminal-secret': TERMINAL_SECRET,
    },
    payload: { cashierId: CASHIER_ID, tableLabel: 'T1', syncId },
  });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error.code, 'DUPLICATE_SYNC_ID');
  assert.equal(second.json().result.id, chequeId);

  const count = await prisma.cheque.count({
    where: { id: chequeId, venueId: VENUE_ID },
  });
  assert.equal(count, 1);
});
