import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000095';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000095';
const TERMINAL_SECRET = 'phase1-test-secret';
const CASHIER_ID = '00000000-0000-4000-8000-000000000094';

let app;
let managerToken;
let templateId;
let categoryId;
let menuItemId;
let orderId;

const terminalHeaders = {
  'x-terminal-id': TERMINAL_ID,
  'x-terminal-secret': TERMINAL_SECRET,
};

before(async () => {
  ensureKeys();
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }) };
  await app.ready();

  const passwordHash = await bcrypt.hash('phase1admin', config.bcryptRounds);
  const pinHash = await bcrypt.hash('5555', config.bcryptRounds);
  const managerPinHash = await bcrypt.hash('8888', config.bcryptRounds);

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: { id: VENUE_ID, nameEn: 'Phase1 Venue', nameAr: 'اختبار', type: 'standard' },
  });

  await prisma.user.upsert({
    where: { username: 'phase1admin' },
    update: {
      passwordHash,
      pinHash: managerPinHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
    create: {
      username: 'phase1admin',
      passwordHash,
      pinHash: managerPinHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });

  await prisma.user.upsert({
    where: { id: CASHIER_ID },
    update: { pinHash, role: 'cashier', venueId: VENUE_ID, username: 'phase1cashier' },
    create: {
      id: CASHIER_ID,
      username: 'phase1cashier',
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
      name: 'P1-POS',
      secretHash: await hashSecret(TERMINAL_SECRET),
    },
  });

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'phase1admin', password: 'phase1admin' },
  });
  managerToken = login.json().accessToken;
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('cashier PIN login works with terminal headers', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin',
    headers: terminalHeaders,
    payload: { pin: '5555' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().user.role, 'cashier');
});

test('manager creates menu with modifier and publishes', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/menu-templates',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      nameEn: 'Phase1 Menu',
      nameAr: 'قائمة',
      venueIds: [VENUE_ID],
    },
  });
  templateId = createRes.json().id;

  const catRes = await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/categories`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { nameEn: 'Mains', nameAr: 'أطباق', sortOrder: 0 },
  });
  categoryId = catRes.json().categories[0].id;

  const itemRes = await app.inject({
    method: 'POST',
    url: `/api/v1/categories/${categoryId}/items`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { nameEn: 'Burger', nameAr: 'برجر', price: 120 },
  });
  menuItemId = itemRes.json().categories[0].items[0].id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/modifier-groups`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      nameEn: 'Size',
      nameAr: 'حجم',
      minSelection: 1,
      maxSelection: 1,
      menuItemIds: [menuItemId],
      options: [
        { nameEn: 'Large', nameAr: 'كبير', priceDelta: 15 },
        { nameEn: 'Regular', nameAr: 'عادي', priceDelta: 0 },
      ],
    },
  });

  const publishRes = await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/publish`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(publishRes.statusCode, 200);
  assert.equal(publishRes.json().status, 'published');
});

test('terminal reads published menu with modifiers', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  assert.equal(res.statusCode, 200);
  const item = res.json().categories[0].items[0];
  assert.ok(item.modifierGroups?.length >= 1);
});

test('order lifecycle: create, add with modifier, qty, send, receipt', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'T5' },
  });
  assert.equal(createRes.statusCode, 200);
  orderId = createRes.json().id;

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const addRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${orderId}/items`,
    headers: terminalHeaders,
    payload: {
      menuItemId,
      quantity: 1,
      modifiers: [
        {
          groupId: group.id,
          optionId: option.id,
          nameEn: option.nameEn,
          nameAr: option.nameAr,
          priceDelta: option.priceDelta,
        },
      ],
    },
  });
  assert.equal(addRes.statusCode, 200);
  const lineId = addRes.json().items[0].id;

  const qtyRes = await app.inject({
    method: 'PATCH',
    url: `/api/v1/orders/${orderId}/items/${lineId}`,
    headers: terminalHeaders,
    payload: { quantity: 2 },
  });
  assert.equal(qtyRes.statusCode, 200);
  assert.equal(qtyRes.json().items[0].quantity, 2);

  const tableRes = await app.inject({
    method: 'PATCH',
    url: `/api/v1/orders/${orderId}`,
    headers: terminalHeaders,
    payload: { tableLabel: 'T12' },
  });
  assert.equal(tableRes.statusCode, 200);
  assert.equal(tableRes.json().tableLabel, 'T12');

  const sendRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${orderId}/send`,
    headers: terminalHeaders,
  });
  assert.equal(sendRes.statusCode, 200);
  assert.equal(sendRes.json().tableLabel, 'T12');
  assert.equal(sendRes.json().status, 'sent');
  assert.ok(sendRes.json().sentAt);

  const blocked = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${orderId}/items`,
    headers: terminalHeaders,
    payload: { menuItemId, quantity: 1 },
  });
  assert.equal(blocked.statusCode, 400);

  const receiptRes = await app.inject({
    method: 'GET',
    url: `/api/v1/orders/${orderId}/receipt`,
    headers: terminalHeaders,
  });
  assert.equal(receiptRes.statusCode, 200);
  assert.ok(receiptRes.json().text.includes('Burger'));
});

test('kitchen orders list returns sent tickets', async () => {
  const kitchenRes = await app.inject({
    method: 'GET',
    url: '/api/v1/kitchen/orders',
    headers: terminalHeaders,
  });
  assert.equal(kitchenRes.statusCode, 200);
  const list = kitchenRes.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.some((o) => o.status === 'sent' && o.items.length > 0));
});

test('kitchen can advance item status through lifecycle', async () => {
  const listRes = await app.inject({
    method: 'GET',
    url: '/api/v1/kitchen/orders',
    headers: terminalHeaders,
  });
  const ticket = listRes.json().find((o) => o.status === 'sent');
  assert.ok(ticket);
  const itemId = ticket.items[0].id;

  for (const status of ['in_progress', 'ready', 'served']) {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/kitchen/orders/${ticket.id}/items/${itemId}/status`,
      headers: terminalHeaders,
      payload: { status },
    });
    assert.equal(res.statusCode, 200);
    const item = res.json().items.find((i) => i.id === itemId);
    assert.equal(item.kitchenStatus, status);
  }
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/api/v1/kitchen/orders',
        headers: terminalHeaders,
      })
    )
      .json()
      .some((o) => o.id === ticket.id),
    false,
  );
});

test('void draft order requires manager PIN and reason', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'V1' },
  });
  assert.equal(createRes.statusCode, 200);
  const draftId = createRes.json().id;

  const badPin = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/void`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, managerPin: '0000', reason: 'Wrong item' },
  });
  assert.equal(badPin.statusCode, 401);

  const voidRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/void`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, managerPin: '8888', reason: 'Customer left' },
  });
  assert.equal(voidRes.statusCode, 200);
  assert.equal(voidRes.json().status, 'voided');
  assert.ok(voidRes.json().closedAt);

  const audit = await prisma.orderVoidAudit.findUnique({ where: { orderId: draftId } });
  assert.ok(audit);
  assert.equal(audit.reason, 'Customer left');
  assert.equal(audit.cashierId, CASHIER_ID);
});

test('void sent order removes it from kitchen list', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'V2' },
  });
  const sentId = createRes.json().id;

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const addRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${sentId}/items`,
    headers: terminalHeaders,
    payload: {
      menuItemId,
      quantity: 1,
      modifiers: [
        {
          groupId: group.id,
          optionId: option.id,
          nameEn: option.nameEn,
          nameAr: option.nameAr,
          priceDelta: option.priceDelta,
        },
      ],
    },
  });
  assert.equal(addRes.statusCode, 200);

  const sendRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${sentId}/send`,
    headers: terminalHeaders,
  });
  assert.equal(sendRes.statusCode, 200);

  const beforeKitchen = await app.inject({
    method: 'GET',
    url: '/api/v1/kitchen/orders',
    headers: terminalHeaders,
  });
  assert.ok(beforeKitchen.json().some((o) => o.id === sentId));

  const voidRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${sentId}/void`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, managerPin: '8888', reason: 'Duplicate ticket' },
  });
  assert.equal(voidRes.statusCode, 200);
  assert.equal(voidRes.json().status, 'voided');

  const afterKitchen = await app.inject({
    method: 'GET',
    url: '/api/v1/kitchen/orders',
    headers: terminalHeaders,
  });
  assert.equal(
    afterKitchen.json().some((o) => o.id === sentId),
    false,
  );
});

test('manager can 86 an item', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/v1/menu-items/${menuItemId}`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { isAvailable: false },
  });
  assert.equal(res.statusCode, 200);
  const item = res.json().categories.flatMap((c) => c.items).find((i) => i.id === menuItemId);
  assert.equal(item.isAvailable, false);
});
