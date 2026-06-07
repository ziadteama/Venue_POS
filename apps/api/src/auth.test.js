import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import bcrypt from 'bcrypt';
import { config } from './config.js';
import { signAccessToken, verifyAccessToken, ensureKeys } from './utils/jwt.js';

let app;

before(async () => {
  ensureKeys();
  app = await buildApp();
  await app.ready();

  const venue = await prisma.venue.upsert({
    where: { id: '00000000-0000-4000-8000-000000000099' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000099',
      nameEn: 'Test Venue',
      nameAr: 'اختبار',
      type: 'standard',
    },
  });

  const passwordHash = await bcrypt.hash('testpass', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'testadmin' },
    update: { passwordHash, role: 'hub_manager', venueId: venue.id },
    create: {
      username: 'testadmin',
      passwordHash,
      role: 'hub_manager',
      venueId: venue.id,
    },
  });

  const ownerHash = await bcrypt.hash('ownerpass', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'testowner' },
    update: { passwordHash: ownerHash, role: 'hub_owner', venueId: venue.id },
    create: {
      username: 'testowner',
      passwordHash: ownerHash,
      role: 'hub_owner',
      venueId: venue.id,
    },
  });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('GET /health returns ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, 'ok');
});

test('POST /api/v1/auth/login rejects bad credentials', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'testadmin', password: 'wrong' },
  });
  assert.equal(res.statusCode, 401);
});

test('POST /api/v1/auth/login rejects non-dashboard roles', async () => {
  const pinHash = await bcrypt.hash('9999', config.bcryptRounds);
  const passwordHash = await bcrypt.hash('cashpass', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'authcashier' },
    update: { passwordHash, pinHash, role: 'cashier', venueId: '00000000-0000-4000-8000-000000000099' },
    create: {
      username: 'authcashier',
      passwordHash,
      pinHash,
      role: 'cashier',
      venueId: '00000000-0000-4000-8000-000000000099',
    },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'authcashier', password: 'cashpass' },
  });
  assert.equal(res.statusCode, 401);
});

test('POST /api/v1/auth/login rejects venue_manager (POS only)', async () => {
  const pinHash = await bcrypt.hash('7777', config.bcryptRounds);
  const passwordHash = await bcrypt.hash('venue123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'authvenue' },
    update: {
      passwordHash,
      pinHash,
      role: 'venue_manager',
      venueId: '00000000-0000-4000-8000-000000000099',
    },
    create: {
      username: 'authvenue',
      passwordHash,
      pinHash,
      role: 'venue_manager',
      venueId: '00000000-0000-4000-8000-000000000099',
    },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'authvenue', password: 'venue123' },
  });
  assert.equal(res.statusCode, 401);
});

test('POST /api/v1/auth/login accepts valid hub manager', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'testadmin', password: 'testpass' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.accessToken);
  assert.equal(body.user.username, 'testadmin');
  assert.equal(body.user.role, 'hub_manager');
});

test('POST /api/v1/auth/login accepts valid hub owner', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'testowner', password: 'ownerpass' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.accessToken);
  assert.equal(body.user.username, 'testowner');
  assert.equal(body.user.role, 'hub_owner');
});

test('JWT access token verifies', () => {
  const token = signAccessToken({ sub: 'user-id', role: 'hub_manager', venue_id: null });
  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, 'user-id');
});
