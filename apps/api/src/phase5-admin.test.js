import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000096';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000096';
const TERMINAL_SECRET = 'phase5-test-secret';

let app;
let hubToken;
let ownerToken;
let venueManagerToken;

const terminalHeaders = {
  'x-terminal-id': TERMINAL_ID,
  'x-terminal-secret': TERMINAL_SECRET,
};

before(async () => {
  ensureKeys();
  app = await buildApp();
  app.io = { sockets: { sockets: new Map() } };
  await app.ready();

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: { id: VENUE_ID, nameEn: 'Phase5 Venue', nameAr: 'اختبار 5', type: 'standard' },
  });

  const hubHash = await bcrypt.hash('phase5hub', config.bcryptRounds);
  const venueHash = await bcrypt.hash('venue123', config.bcryptRounds);
  const venuePin = await bcrypt.hash('7777', config.bcryptRounds);

  await prisma.user.upsert({
    where: { username: 'phase5hub' },
    update: { passwordHash: hubHash, role: 'hub_manager', venueId: VENUE_ID, isActive: true },
    create: {
      username: 'phase5hub',
      passwordHash: hubHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });

  const ownerHash = await bcrypt.hash('phase5owner', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'phase5owner' },
    update: { passwordHash: ownerHash, role: 'hub_owner', venueId: VENUE_ID, isActive: true },
    create: {
      username: 'phase5owner',
      passwordHash: ownerHash,
      role: 'hub_owner',
      venueId: VENUE_ID,
    },
  });

  await prisma.user.upsert({
    where: { username: 'phase5venue' },
    update: {
      passwordHash: venueHash,
      pinHash: venuePin,
      role: 'venue_manager',
      venueId: VENUE_ID,
      isActive: true,
    },
    create: {
      username: 'phase5venue',
      passwordHash: venueHash,
      pinHash: venuePin,
      role: 'venue_manager',
      venueId: VENUE_ID,
    },
  });

  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    update: { secretHash: await hashSecret(TERMINAL_SECRET), venueId: VENUE_ID, name: 'P5-POS' },
    create: {
      id: TERMINAL_ID,
      venueId: VENUE_ID,
      name: 'P5-POS',
      secretHash: await hashSecret(TERMINAL_SECRET),
    },
  });

  hubToken = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'phase5hub', password: 'phase5hub' },
    })
  ).json().accessToken;

  ownerToken = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'phase5owner', password: 'phase5owner' },
    })
  ).json().accessToken;

  const venueLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'phase5venue', password: 'venue123' },
  });
  assert.equal(venueLogin.statusCode, 401);

  const venueUser = await prisma.user.findUnique({ where: { username: 'phase5venue' } });
  venueManagerToken = signAccessToken({
    sub: venueUser.id,
    role: 'venue_manager',
    venue_id: VENUE_ID,
  });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('hub manager can create and list staff for a venue', async () => {
  const username = `cashier_${Date.now()}`;
  const pin = `9${String(Date.now()).slice(-3)}`;
  const create = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/users?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${hubToken}` },
    payload: { username, role: 'cashier', pin },
  });
  assert.equal(create.statusCode, 200);
  assert.equal(create.json().username, username);

  const list = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/users?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${hubToken}` },
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().some((u) => u.username === username));
});

test('venue manager cannot use web staff API', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/users?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('EOD reconciliation returns daily rollup for hub manager', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts/eod?venueId=${VENUE_ID}&date=2026-06-07`,
    headers: { authorization: `Bearer ${hubToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().date, '2026-06-07');
  assert.ok(Array.isArray(res.json().shifts));
});

test('CEO cannot access EOD reconciliation', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts/eod?venueId=${VENUE_ID}&date=2026-06-07`,
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('system health lists terminals', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/health?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${hubToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().terminals.length >= 1);
  assert.ok(res.json().server.uptimeSeconds >= 0);
});

test('terminal heartbeat updates last seen', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/terminals/heartbeat',
    headers: { ...terminalHeaders, 'x-sync-queue-depth': '3' },
    payload: { syncQueueDepth: 3 },
  });
  assert.equal(res.statusCode, 200);
  const terminal = await prisma.terminal.findUnique({ where: { id: TERMINAL_ID } });
  assert.ok(terminal.lastSeenAt);
  assert.equal(terminal.syncQueueDepth, 3);
});

test('full audit log is hub manager only', async () => {
  const manager = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/audit?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${hubToken}` },
  });
  assert.equal(manager.statusCode, 200);
  assert.ok(Array.isArray(manager.json().events));

  const ceo = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/audit?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(ceo.statusCode, 403);

  const venue = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/audit?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(venue.statusCode, 403);
});
