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

  await prisma.user.upsert({
    where: { username: 'testadmin' },
    update: {},
    create: {
      username: 'testadmin',
      passwordHash: await bcrypt.hash('testpass', config.bcryptRounds),
      role: 'hub_manager',
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

test('POST /api/v1/auth/login accepts valid manager', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'testadmin', password: 'testpass' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.accessToken);
  assert.equal(body.user.username, 'testadmin');
});

test('JWT access token verifies', () => {
  const token = signAccessToken({ sub: 'user-id', role: 'hub_manager', venue_id: null });
  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, 'user-id');
});
