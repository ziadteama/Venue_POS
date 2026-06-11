import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';
import { resolveHubFeatures, updateHubFeatures } from './services/hub-settings-service.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000098';

let app;
let hubToken;
let ownerToken;

before(async () => {
  ensureKeys();
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }) };
  await app.ready();

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: { id: VENUE_ID, nameEn: 'Hub Settings Test', nameAr: 'اختبار', type: 'standard' },
  });

  const hubHash = await bcrypt.hash('hubset123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'hubsetmgr' },
    update: { passwordHash: hubHash, role: 'hub_manager', venueId: VENUE_ID, isActive: true },
    create: {
      username: 'hubsetmgr',
      passwordHash: hubHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });

  const ownerHash = await bcrypt.hash('hubsetown', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'hubsetown' },
    update: { passwordHash: ownerHash, role: 'hub_owner', venueId: VENUE_ID, isActive: true },
    create: {
      username: 'hubsetown',
      passwordHash: ownerHash,
      role: 'hub_owner',
      venueId: VENUE_ID,
    },
  });

  hubToken = signAccessToken({ sub: 'hubsetmgr', role: 'hub_manager', venue_id: VENUE_ID });
  ownerToken = signAccessToken({ sub: 'hubsetown', role: 'hub_owner', venue_id: VENUE_ID });
});

after(async () => {
  await prisma.hubSettings.deleteMany({});
  await prisma.user.deleteMany({ where: { username: { in: ['hubsetmgr', 'hubsetown'] } } });
  await app.close();
});

test('hub manager can read and update feature toggles', async () => {
  const getRes = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/hub-settings/features',
    headers: { authorization: `Bearer ${hubToken}` },
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(typeof getRes.json().discounts, 'boolean');

  const putRes = await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/hub-settings/features',
    headers: { authorization: `Bearer ${hubToken}` },
    payload: { discounts: false, kdsEnabled: false },
  });
  assert.equal(putRes.statusCode, 200);
  assert.equal(putRes.json().discounts, false);
  assert.equal(putRes.json().kdsEnabled, false);

  const resolved = await resolveHubFeatures();
  assert.equal(resolved.discounts, false);
});

test('CEO cannot update hub feature toggles', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/hub-settings/features',
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { discounts: true },
  });
  assert.equal(res.statusCode, 403);
});

test('updateHubFeatures merges partial patch', async () => {
  await updateHubFeatures({ refunds: true });
  const next = await updateHubFeatures({ lineTransfer: false });
  assert.equal(next.refunds, true);
  assert.equal(next.lineTransfer, false);
});
