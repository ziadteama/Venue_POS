import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { OPS_EVENT_TYPES, OPS_SEVERITY } from '@venue-pos/shared';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000097';

let app;
let opsToken;

before(async () => {
  ensureKeys();
  app = await buildApp();
  app.io = {
    to: () => ({ emit: () => {} }),
  };
  await app.ready();

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: { id: VENUE_ID, nameEn: 'Ops Test Venue', nameAr: 'اختبار', type: 'standard' },
  });

  const hash = await bcrypt.hash('opsadmin', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'opsadmin' },
    update: { passwordHash: hash, role: 'system_admin', venueId: VENUE_ID, isActive: true },
    create: {
      username: 'opsadmin',
      passwordHash: hash,
      role: 'system_admin',
      venueId: VENUE_ID,
    },
  });

  opsToken = signAccessToken({
    sub: 'opsadmin',
    role: 'system_admin',
    venue_id: VENUE_ID,
  });
});

after(async () => {
  await prisma.opsEvent.deleteMany({});
  await prisma.user.deleteMany({ where: { username: 'opsadmin' } });
  await prisma.terminal.deleteMany({ where: { venueId: VENUE_ID } });
  await prisma.venue.deleteMany({ where: { id: VENUE_ID } });
  await app.close();
});

test('system_admin can load ops dashboard', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/dashboard',
    headers: { authorization: `Bearer ${opsToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.health);
  assert.ok(Array.isArray(body.events));
  assert.ok(body.summary);
});

test('hub manager cannot access ops dashboard', async () => {
  const hubToken = signAccessToken({
    sub: 'hub',
    role: 'hub_manager',
    venue_id: VENUE_ID,
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/dashboard',
    headers: { authorization: `Bearer ${hubToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('ops ingest requires secret', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/events',
    payload: {
      type: OPS_EVENT_TYPES.WATCHDOG_RESTART_STORM,
      title: 'Restart storm',
      message: 'POS restarted 3 times',
    },
  });
  assert.equal(res.statusCode, 403);
});

test('ops ingest records event with valid secret', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/events',
    headers: { 'x-ops-ingest-secret': config.opsIngestSecret },
    payload: {
      type: OPS_EVENT_TYPES.WATCHDOG_RESTART_STORM,
      severity: OPS_SEVERITY.CRITICAL,
      source: 'watchdog',
      title: 'Restart storm',
      message: 'POS restarted 3 times in 10 minutes',
      details: { count: 3 },
    },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.type, OPS_EVENT_TYPES.WATCHDOG_RESTART_STORM);
  assert.equal(body.severity, OPS_SEVERITY.CRITICAL);
});
