import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000097';
const EXISTING_TERMINAL_ID = '00000000-0000-4000-8000-000000000097';
const EXISTING_TERMINAL_SECRET = 'mgr-terminals-test-secret';
const CASHIER_ID = '00000000-0000-4000-8000-000000000197';

let app;
let hubToken;
let ownerToken;

before(async () => {
  ensureKeys();
  app = await buildApp();
  await app.ready();

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: { isActive: true },
    create: { id: VENUE_ID, nameEn: 'Terminals Test Venue', nameAr: 'محطة', type: 'standard' },
  });

  const hubHash = await bcrypt.hash('mgrtermhub', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'mgrtermhub' },
    update: { passwordHash: hubHash, role: 'hub_manager', venueId: VENUE_ID, isActive: true },
    create: {
      username: 'mgrtermhub',
      passwordHash: hubHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });

  const ownerHash = await bcrypt.hash('mgrtermowner', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'mgrtermowner' },
    update: { passwordHash: ownerHash, role: 'hub_owner', venueId: VENUE_ID, isActive: true },
    create: {
      username: 'mgrtermowner',
      passwordHash: ownerHash,
      role: 'hub_owner',
      venueId: VENUE_ID,
    },
  });

  const cashierPin = await bcrypt.hash('4321', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'mgrtermcashier' },
    update: {
      pinHash: cashierPin,
      role: 'cashier',
      venueId: VENUE_ID,
      isActive: true,
    },
    create: {
      id: CASHIER_ID,
      username: 'mgrtermcashier',
      pinHash: cashierPin,
      role: 'cashier',
      venueId: VENUE_ID,
    },
  });

  await prisma.terminal.upsert({
    where: { id: EXISTING_TERMINAL_ID },
    update: {
      secretHash: await hashSecret(EXISTING_TERMINAL_SECRET),
      venueId: VENUE_ID,
      name: 'Existing POS',
      isActive: true,
    },
    create: {
      id: EXISTING_TERMINAL_ID,
      venueId: VENUE_ID,
      name: 'Existing POS',
      secretHash: await hashSecret(EXISTING_TERMINAL_SECRET),
    },
  });

  hubToken = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'mgrtermhub', password: 'mgrtermhub' },
    })
  ).json().accessToken;

  ownerToken = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'mgrtermowner', password: 'mgrtermowner' },
    })
  ).json().accessToken;
});

after(async () => {
  await prisma.terminal.deleteMany({ where: { venueId: VENUE_ID, id: { not: EXISTING_TERMINAL_ID } } });
  await app.close();
});

test('hub manager cannot create terminal via manager route', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/manager/terminals',
    headers: { authorization: `Bearer ${hubToken}` },
    payload: { venueId: VENUE_ID, name: 'Blocked' },
  });
  assert.equal(res.statusCode, 404);
});

test('GET terminals includes status and never exposes secret', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/terminals?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${hubToken}` },
  });
  assert.equal(res.statusCode, 200);
  const rows = res.json();
  assert.ok(rows.length >= 1);
  for (const row of rows) {
    assert.ok(['pending', 'online', 'offline'].includes(row.status));
    assert.equal(row.secret, undefined);
    assert.equal(row.secretHash, undefined);
  }
});
