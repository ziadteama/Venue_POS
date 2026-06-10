import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';
import { seedPublishedVenueMenu } from './test-helpers/venue-menu-fixture.js';
import { TAKEAWAY_TABLE_LABEL } from '@venue-pos/shared';

const VENUE_ID = '00000000-0000-4000-8000-0000000000d1';
const TERMINAL_ID = '00000000-0000-4000-8000-0000000000d2';
const CASHIER_ID = '00000000-0000-4000-8000-0000000000d3';
const SECRET = 'takeaway-test-secret';

const headers = { 'x-terminal-id': TERMINAL_ID, 'x-terminal-secret': SECRET };

let app;

before(async () => {
  ensureKeys();
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }) };
  await app.ready();

  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  const secretHash = await hashSecret(SECRET);

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: { isActive: true },
    create: { id: VENUE_ID, nameEn: 'Takeaway Venue', nameAr: 'سفري', type: 'standard' },
  });
  await prisma.user.upsert({
    where: { id: CASHIER_ID },
    update: { pinHash, role: 'cashier', venueId: VENUE_ID, isActive: true },
    create: {
      id: CASHIER_ID,
      username: 'ta_cashier',
      passwordHash: pinHash,
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
    },
  });
  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    update: { secretHash, venueId: VENUE_ID, isActive: true },
    create: { id: TERMINAL_ID, venueId: VENUE_ID, name: 'TA Till', secretHash },
  });

  await seedPublishedVenueMenu(prisma, VENUE_ID);

  await prisma.cheque.updateMany({
    where: { venueId: VENUE_ID, status: 'open' },
    data: { status: 'voided', closedAt: new Date() },
  });

  await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers,
    payload: { cashierId: CASHIER_ID, openFloat: 100 },
  });
});

after(async () => {
  await app?.close();
});

test('open takeaway cheque has no floor table and resumes single counter', async () => {
  const first = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers,
    payload: { cashierId: CASHIER_ID, serviceMode: 'takeaway' },
  });
  assert.equal(first.statusCode, 200, first.body);
  const body = first.json();
  assert.equal(body.serviceMode, 'takeaway');
  assert.equal(body.tableLabel, TAKEAWAY_TABLE_LABEL);
  assert.equal(body.floorTableId, null);

  const floor = await prisma.floorTable.findFirst({
    where: { tableLabel: TAKEAWAY_TABLE_LABEL },
  });
  assert.equal(floor, null);

  const second = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers,
    payload: { cashierId: CASHIER_ID, serviceMode: 'takeaway' },
  });
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().id, body.id);
});

test('dine-in cheque still occupies hub floor table', async () => {
  const label = 'TA-DINE-7';
  const open = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers,
    payload: { cashierId: CASHIER_ID, tableLabel: label, serviceMode: 'dine_in' },
  });
  assert.equal(open.statusCode, 200, open.body);
  const cheque = open.json();
  assert.equal(cheque.serviceMode, 'dine_in');
  assert.ok(cheque.floorTableId);

  const hub = await prisma.floorTable.findUnique({ where: { tableLabel: label } });
  assert.ok(hub);
  assert.equal(hub.occupiedByChequeId, cheque.id);
});
