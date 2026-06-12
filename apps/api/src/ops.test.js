import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { OPS_EVENT_TYPES, OPS_SEVERITY } from '@venue-pos/shared';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000099';
const OPS_USER_ID = '00000000-0000-4000-8000-000000000298';

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
      id: OPS_USER_ID,
      username: 'opsadmin',
      passwordHash: hash,
      role: 'system_admin',
      venueId: VENUE_ID,
    },
  });

  opsToken = signAccessToken({
    sub: OPS_USER_ID,
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

test('system_admin can create terminal and receives secret once', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/terminals',
    headers: { authorization: `Bearer ${opsToken}` },
    payload: { venueId: VENUE_ID, name: 'Ops Till' },
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.match(body.id, /^[0-9a-f-]{36}$/i);
  assert.equal(body.venueId, VENUE_ID);
  assert.equal(body.name, 'Ops Till');
  assert.equal(body.status, 'pending');
  assert.ok(body.secret);
  assert.ok(body.secret.length >= 16);

  const list = await app.inject({
    method: 'GET',
    url: `/api/v1/ops/terminals?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${opsToken}` },
  });
  assert.equal(list.statusCode, 200);
  const rows = list.json();
  const created = rows.find((t) => t.id === body.id);
  assert.ok(created);
  assert.equal(created.status, 'pending');
  assert.equal(created.secret, undefined);

  await prisma.terminal.delete({ where: { id: body.id } });
});

test('hub manager cannot create terminal via ops route', async () => {
  const hubToken = signAccessToken({
    sub: 'hub',
    role: 'hub_manager',
    venue_id: VENUE_ID,
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/terminals',
    headers: { authorization: `Bearer ${hubToken}` },
    payload: { venueId: VENUE_ID, name: 'Blocked' },
  });
  assert.equal(res.statusCode, 403);
});

test('create terminal rejects invalid venueId', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/terminals',
    headers: { authorization: `Bearer ${opsToken}` },
    payload: { venueId: '00000000-0000-4000-8000-000000999999' },
  });
  assert.equal(res.statusCode, 404);
});
