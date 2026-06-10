import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000098';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000098';
const TERMINAL_SECRET = 'test-terminal-secret';
const CASHIER_ID = '00000000-0000-4000-8000-00000000009b';
const CASHIER_USERNAME = 'menutest_cashier';

let app;
let managerToken;
let venueManagerToken;
let categoryId;
let menuItemId;

before(async () => {
  ensureKeys();
  app = await buildApp();
  await app.ready();

  const passwordHash = await bcrypt.hash('menutest', config.bcryptRounds);
  const pinHash = await bcrypt.hash('9999', config.bcryptRounds);

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: {
      id: VENUE_ID,
      nameEn: 'Menu Test Venue',
      nameAr: 'اختبار القائمة',
      type: 'standard',
    },
  });

  await prisma.user.upsert({
    where: { username: 'menutestadmin' },
    update: { passwordHash, role: 'hub_manager', venueId: VENUE_ID },
    create: {
      username: 'menutestadmin',
      passwordHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });

  await prisma.user.upsert({
    where: { username: CASHIER_USERNAME },
    update: { pinHash, role: 'cashier', venueId: VENUE_ID, isActive: true },
    create: {
      id: CASHIER_ID,
      username: CASHIER_USERNAME,
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
      isActive: true,
    },
  });

  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    update: { secretHash: await hashSecret(TERMINAL_SECRET), venueId: VENUE_ID },
    create: {
      id: TERMINAL_ID,
      venueId: VENUE_ID,
      name: 'TEST-POS',
      secretHash: await hashSecret(TERMINAL_SECRET),
    },
  });

  const venuePasswordHash = await bcrypt.hash('venue123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'menutestvenue' },
    update: {
      passwordHash: venuePasswordHash,
      role: 'venue_manager',
      venueId: VENUE_ID,
      isActive: true,
    },
    create: {
      username: 'menutestvenue',
      passwordHash: venuePasswordHash,
      role: 'venue_manager',
      venueId: VENUE_ID,
    },
  });

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'menutestadmin', password: 'menutest' },
  });
  managerToken = login.json().accessToken;

  const venueUser = await prisma.user.findUnique({ where: { username: 'menutestvenue' } });
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

test('venue manager cannot read venue menu editor API', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('manager can build and publish a venue menu', async () => {
  const categoryRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/categories`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { nameEn: 'Drinks', nameAr: 'مشروبات', sortOrder: 0 },
  });
  assert.equal(categoryRes.statusCode, 200);
  categoryId = categoryRes.json().categories[0].id;

  const itemRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/categories/${categoryId}/items`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      nameEn: 'Espresso',
      nameAr: 'إسبريسو',
      price: 35.5,
    },
  });
  assert.equal(itemRes.statusCode, 200);
  menuItemId = itemRes.json().categories[0].items[0].id;

  const modRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/modifier-groups`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      nameEn: 'Size',
      nameAr: 'حجم',
      minSelection: 1,
      maxSelection: 1,
      menuItemIds: [menuItemId],
      options: [{ nameEn: 'Large', nameAr: 'كبير', priceDelta: 5 }],
    },
  });
  assert.equal(modRes.statusCode, 200);

  const publishRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/publish`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(publishRes.statusCode, 200);
  assert.equal(publishRes.json().status, 'published');
  assert.ok(publishRes.json().versionHash);
});

test('terminal can fetch published venue menu', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: {
      'x-terminal-id': TERMINAL_ID,
      'x-terminal-secret': TERMINAL_SECRET,
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().venueId, VENUE_ID);
  assert.ok(res.json().versionHash);
  assert.ok(res.json().categories.length >= 1);
  const item = res.json().categories[0].items[0];
  assert.equal(item.nameEn, 'Espresso');
});

test('manager can soft-delete menu item', async () => {
  const res = await app.inject({
    method: 'DELETE',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/items/${menuItemId}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const deleted = res.json().categories[0].items.find((i) => i.id === menuItemId);
  assert.equal(deleted, undefined);
});
