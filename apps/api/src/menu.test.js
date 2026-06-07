import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000098';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000098';
const TERMINAL_SECRET = 'test-terminal-secret';
const CASHIER_ID = '00000000-0000-4000-8000-000000000097';

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
    where: { id: CASHIER_ID },
    update: { pinHash, role: 'cashier', venueId: VENUE_ID, username: 'menucashier' },
    create: {
      id: CASHIER_ID,
      username: 'menucashier',
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
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

  const venueLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'menutestvenue', password: 'venue123' },
  });
  venueManagerToken = venueLogin.json().accessToken;
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('venue manager cannot list or read menu templates', async () => {
  const listRes = await app.inject({
    method: 'GET',
    url: '/api/v1/menu-templates',
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(listRes.statusCode, 403);

  const detailRes = await app.inject({
    method: 'GET',
    url: '/api/v1/menu-templates/00000000-0000-4000-8000-000000000001',
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(detailRes.statusCode, 403);
});

test('manager can create and publish a menu template', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/menu-templates',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      nameEn: 'Lunch Menu',
      nameAr: 'قائمة الغداء',
      venueIds: [VENUE_ID],
    },
  });
  assert.equal(createRes.statusCode, 200);
  const templateId = createRes.json().id;

  const categoryRes = await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/categories`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { nameEn: 'Drinks', nameAr: 'مشروبات', sortOrder: 0 },
  });
  assert.equal(categoryRes.statusCode, 200);
  categoryId = categoryRes.json().categories[0].id;

  const itemRes = await app.inject({
    method: 'POST',
    url: `/api/v1/categories/${categoryId}/items`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      nameEn: 'Espresso',
      nameAr: 'إسبريسو',
      price: 35.5,
    },
  });
  assert.equal(itemRes.statusCode, 200);
  menuItemId = itemRes.json().categories[0].items[0].id;

  const publishRes = await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/publish`,
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
  const body = res.json();
  assert.equal(body.venueId, VENUE_ID);
  assert.ok(body.categories.length >= 1);
  assert.ok(body.categories[0].items.length >= 1);
});

test('terminal can create order and add item', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: {
      'x-terminal-id': TERMINAL_ID,
      'x-terminal-secret': TERMINAL_SECRET,
    },
    payload: { cashierId: CASHIER_ID, tableLabel: 'T1' },
  });
  assert.equal(createRes.statusCode, 200);
  const order = createRes.json();
  assert.equal(order.status, 'draft');
  assert.ok(order.orderNumber >= 1);

  const addRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${order.id}/items`,
    headers: {
      'x-terminal-id': TERMINAL_ID,
      'x-terminal-secret': TERMINAL_SECRET,
    },
    payload: { menuItemId, quantity: 2 },
  });
  assert.equal(addRes.statusCode, 200);
  assert.equal(addRes.json().items.length, 1);
  assert.equal(addRes.json().items[0].quantity, 2);
  assert.equal(addRes.json().subtotal, 71);
});
