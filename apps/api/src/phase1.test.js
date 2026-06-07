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
let venueManagerToken;
let templateId;
let categoryId;
let menuItemId;
let orderId;

const terminalHeaders = {
  'x-terminal-id': TERMINAL_ID,
  'x-terminal-secret': TERMINAL_SECRET,
};

async function ensureOpenShift(openFloat = 500) {
  const active = await app.inject({
    method: 'GET',
    url: `/api/v1/shifts/active?cashierId=${CASHIER_ID}`,
    headers: terminalHeaders,
  });
  if (active.json()?.id) return active.json();

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, openFloat },
  });
  assert.equal(res.statusCode, 200);
  return res.json();
}

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

  const venueManagerPinHash = await bcrypt.hash('7777', config.bcryptRounds);
  const venuePasswordHash = await bcrypt.hash('venue123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'phase1venue' },
    update: {
      pinHash: venueManagerPinHash,
      passwordHash: venuePasswordHash,
      role: 'venue_manager',
      venueId: VENUE_ID,
      isActive: true,
    },
    create: {
      username: 'phase1venue',
      pinHash: venueManagerPinHash,
      passwordHash: venuePasswordHash,
      role: 'venue_manager',
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

  const venueLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'phase1venue', password: 'venue123' },
  });
  venueManagerToken = venueLogin.json().accessToken;
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
  const ticket = listRes.json().find((o) => o.status === 'sent' && o.items?.length > 0);
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

test('clear abandons draft order without manager approval', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'V1' },
  });
  assert.equal(createRes.statusCode, 200);
  const draftId = createRes.json().id;

  const abandonRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/abandon`,
    headers: terminalHeaders,
  });
  assert.equal(abandonRes.statusCode, 200);
  assert.equal(abandonRes.json().abandoned, true);

  const gone = await prisma.order.findUnique({ where: { id: draftId } });
  assert.equal(gone, null);
});

test('cheque lifecycle: open, fire two rounds, pay cash', async () => {
  await ensureOpenShift();
  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'C3' },
  });
  assert.equal(openRes.statusCode, 200);
  const chequeId = openRes.json().id;
  let draftId = openRes.json().draftOrder.id;

  const addRound = async (qty) => {
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${draftId}/items`,
      headers: terminalHeaders,
      payload: {
        menuItemId,
        quantity: qty,
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
    const fireRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cheques/${chequeId}/fire`,
      headers: terminalHeaders,
    });
    assert.equal(fireRes.statusCode, 200);
    assert.equal(fireRes.json().sentOrder.status, 'sent');
    draftId = fireRes.json().cheque.draftOrder.id;
    return fireRes.json().cheque;
  };

  const afterFirst = await addRound(1);
  assert.equal(afterFirst.orders.filter((o) => o.status === 'sent').length, 1);
  assert.ok(afterFirst.total > 0);

  const afterSecond = await addRound(2);
  assert.equal(afterSecond.orders.filter((o) => o.status === 'sent').length, 2);

  const payRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payRes.statusCode, 200);
  assert.equal(payRes.json().cheque.status, 'paid');
  assert.ok(payRes.json().receipt?.includes('TOTAL'));
  assert.ok(payRes.json().cheque.payments.length >= 1);
  assert.equal(
    payRes.json().cheque.orders.filter((o) => o.status === 'closed').length,
    2,
  );

  const resumeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'C3' },
  });
  assert.equal(resumeRes.statusCode, 200);
  assert.notEqual(resumeRes.json().id, chequeId);
  assert.equal(resumeRes.json().status, 'open');
});

test('cheque delete empty open table', async () => {
  await ensureOpenShift();
  const uid = `${Date.now()}`.slice(-8);
  const tableA = `DL${uid}A`;
  const tableB = `DL${uid}B`;

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: tableA },
  });
  assert.equal(openRes.statusCode, 200);
  const chequeId = openRes.json().id;
  assert.equal(openRes.json().total ?? 0, 0);

  const deleteRes = await app.inject({
    method: 'DELETE',
    url: `/api/v1/cheques/${chequeId}`,
    headers: terminalHeaders,
  });
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(deleteRes.json().deleted, true);

  const getRes = await app.inject({
    method: 'GET',
    url: `/api/v1/cheques/${chequeId}`,
    headers: terminalHeaders,
  });
  assert.equal(getRes.statusCode, 404);

  const openRes2 = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: tableB },
  });
  assert.equal(openRes2.statusCode, 200);
  const chequeId2 = openRes2.json().id;

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];
  let draftId = openRes2.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const blockedRes = await app.inject({
    method: 'DELETE',
    url: `/api/v1/cheques/${chequeId2}`,
    headers: terminalHeaders,
  });
  assert.equal(blockedRes.statusCode, 400);
});

test('cheque open resumes same table and merges orphan draft items', async () => {
  await ensureOpenShift();
  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const uid = `${Date.now()}`.slice(-8);
  const table = `MR${uid}`;

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: table },
  });
  assert.equal(openRes.statusCode, 200);
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  const addRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const otherTable = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: `${table}X` },
  });
  assert.equal(otherTable.statusCode, 200);

  const resumeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: table },
  });
  assert.equal(resumeRes.statusCode, 200);
  assert.equal(resumeRes.json().id, chequeId);
  assert.equal(resumeRes.json().draftOrder?.items?.length, 1);
});

test('cheque split payment: cash + card', async () => {
  await ensureOpenShift();
  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'S1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  const total = fireRes.json().cheque.total;
  const cashPart = Math.round(total * 0.4 * 100) / 100;
  const cardPart = Math.round((total - cashPart) * 100) / 100;

  const payRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: {
      cashierId: CASHIER_ID,
      payments: [
        { method: 'cash', amount: cashPart },
        { method: 'card', amount: cardPart },
      ],
      tendered: cashPart,
    },
  });
  assert.equal(payRes.statusCode, 200);
  assert.equal(payRes.json().cheque.payments.length, 2);
  assert.equal(payRes.json().change, 0);
});

test('manager can void a kitchen round on open cheque', async () => {
  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'M1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  const sentOrderId = fireRes.json().sentOrder.id;

  const voidRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeId}/orders/${sentOrderId}/void`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
    payload: { managerPin: '7777', reason: 'Wrong table' },
  });
  assert.equal(voidRes.statusCode, 200);
  const voided = voidRes.json().orders.find((o) => o.id === sentOrderId);
  assert.equal(voided.status, 'voided');
  assert.equal(voidRes.json().total, 0);

  const listRes = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/cheques/open',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.ok(listRes.json().some((c) => c.id === chequeId));
});

test('manager can comp a line item on open cheque', async () => {
  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'CP1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  const sentOrder = fireRes.json().sentOrder;
  const itemId = sentOrder.items[0].id;
  const totalBefore = fireRes.json().cheque.total;
  assert.ok(totalBefore > 0);

  const compRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeId}/orders/${sentOrder.id}/items/${itemId}/comp`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
    payload: { managerPin: '7777', reason: 'Guest complaint' },
  });
  assert.equal(compRes.statusCode, 200);
  assert.equal(compRes.json().total, 0);
  const compedLine = compRes
    .json()
    .orders.find((o) => o.id === sentOrder.id)
    .items.find((i) => i.id === itemId);
  assert.equal(compedLine.isComped, true);
});

test('manager can list paid cheque history', async () => {
  await ensureOpenShift();
  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'PH1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });

  await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });

  const paidListRes = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/cheques?status=paid',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(paidListRes.statusCode, 200);
  const paidCheque = paidListRes.json().find((c) => c.id === chequeId);
  assert.ok(paidCheque);
  assert.equal(paidCheque.status, 'paid');
  assert.ok(paidCheque.payments.length >= 1);
});

test('manager can void entire open cheque', async () => {
  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'M2' },
  });
  const chequeId = openRes.json().id;

  const voidRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeId}/void`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
    payload: { managerPin: '7777', reason: 'Guest left' },
  });
  assert.equal(voidRes.statusCode, 200);
  assert.equal(voidRes.json().status, 'voided');

  const listRes = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/cheques/open',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(
    listRes.json().some((c) => c.id === chequeId),
    false,
  );
});

test('cheque split by item: pay sub-cheques closes parent', async () => {
  await ensureOpenShift();
  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];
  const modifier = {
    groupId: group.id,
    optionId: option.id,
    nameEn: option.nameEn,
    nameAr: option.nameAr,
    priceDelta: option.priceDelta,
  };

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'SP1' },
  });
  const parentId = openRes.json().id;
  let draftId = openRes.json().draftOrder.id;

  const fireRound = async () => {
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${draftId}/items`,
      headers: terminalHeaders,
      payload: { menuItemId, quantity: 1, modifiers: [modifier] },
    });
    const fireRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cheques/${parentId}/fire`,
      headers: terminalHeaders,
    });
    draftId = fireRes.json().cheque.draftOrder.id;
    return fireRes.json().cheque;
  };

  const afterFirst = await fireRound();
  const afterSecond = await fireRound();
  const itemA = afterFirst.orders.find((o) => o.status === 'sent').items[0].id;
  const itemB = afterSecond.orders.filter((o) => o.status === 'sent').at(-1).items[0].id;

  const splitRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${parentId}/split`,
    headers: terminalHeaders,
    payload: {
      splits: [
        { label: 'Guest 1', itemIds: [itemA] },
        { label: 'Guest 2', itemIds: [itemB] },
      ],
    },
  });
  assert.equal(splitRes.statusCode, 200);
  assert.equal(splitRes.json().childCheques.length, 2);
  assert.equal(splitRes.json().total, 0);

  const childA = splitRes.json().childCheques.find((c) => c.splitLabel === 'Guest 1');
  const childB = splitRes.json().childCheques.find((c) => c.splitLabel === 'Guest 2');
  assert.ok(childA.total > 0);
  assert.ok(childB.total > 0);

  const payA = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${childA.id}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payA.statusCode, 200);
  assert.equal(payA.json().cheque.status, 'paid');

  const parentMid = await app.inject({
    method: 'GET',
    url: `/api/v1/cheques/${parentId}`,
    headers: terminalHeaders,
  });
  assert.equal(parentMid.json().status, 'open');

  const payB = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${childB.id}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payB.statusCode, 200);

  const parentFinal = await app.inject({
    method: 'GET',
    url: `/api/v1/cheques/${parentId}`,
    headers: terminalHeaders,
  });
  assert.equal(parentFinal.json().status, 'paid');
  assert.equal(
    parentFinal.json().orders.filter((o) => o.status === 'closed').length,
    2,
  );
});

test('cashier can open and close shift with payment linkage', async () => {
  await prisma.shift.deleteMany({ where: { cashierId: CASHIER_ID } });

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, openFloat: 200 },
  });
  assert.equal(openRes.statusCode, 200);
  assert.equal(openRes.json().status, 'open');
  assert.equal(openRes.json().openFloat, 200);

  const dupRes = await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, openFloat: 100 },
  });
  assert.equal(dupRes.statusCode, 400);

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const chequeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'SH1' },
  });
  const chequeId = chequeRes.json().id;
  const draftId = chequeRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });

  const payRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payRes.statusCode, 200);
  const paidTotal = payRes.json().cheque.payments[0].amount;
  assert.ok(paidTotal > 0);

  const activeRes = await app.inject({
    method: 'GET',
    url: `/api/v1/shifts/active?cashierId=${CASHIER_ID}`,
    headers: terminalHeaders,
  });
  assert.equal(activeRes.statusCode, 200);
  assert.equal(activeRes.json().report.paymentCount, 1);
  assert.equal(activeRes.json().report.expectedCash, 200 + paidTotal);

  const payments = await prisma.payment.findMany({
    where: { shiftId: activeRes.json().id },
  });
  assert.equal(payments.length, 1);

  const closeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/close',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, closeFloat: 200 + paidTotal },
  });
  assert.equal(closeRes.statusCode, 200);
  assert.equal(closeRes.json().shift.status, 'closed');
  assert.equal(closeRes.json().report.overShortAmount, 0);

  const events = await prisma.shiftEvent.findMany({
    where: { shiftId: closeRes.json().shift.id },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].action, 'open');
  assert.equal(events[1].action, 'close');
});

test('manual card payment stores optional last-4', async () => {
  await ensureOpenShift();

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'MC1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  const total = fireRes.json().cheque.total;

  const payRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: {
      cashierId: CASHIER_ID,
      payments: [{ method: 'card', amount: total, cardLast4: '4242' }],
    },
  });
  assert.equal(payRes.statusCode, 200);
  const cardPayment = payRes.json().cheque.payments.find((p) => p.method === 'card');
  assert.equal(cardPayment.cardLast4, '4242');
});

test('features endpoint exposes manual card flag', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/features',
    headers: terminalHeaders,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.json().manualCardPayment, 'boolean');
  assert.ok(res.json().manualCardApprovalThreshold > 0);
  assert.equal(typeof res.json().lineTransfer, 'boolean');
});

test('split cheque by custom amount and pay children', async () => {
  await ensureOpenShift();

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'AM1' },
  });
  const parentId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${parentId}/fire`,
    headers: terminalHeaders,
  });
  const total = fireRes.json().cheque.total;
  const half = Number((total / 2).toFixed(2));
  const rest = Number((total - half).toFixed(2));

  const splitRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${parentId}/split-amount`,
    headers: terminalHeaders,
    payload: {
      splits: [
        { label: 'Guest A', amount: half },
        { label: 'Guest B', amount: rest },
      ],
    },
  });
  assert.equal(splitRes.statusCode, 200);
  assert.equal(splitRes.json().childCheques.length, 2);
  assert.equal(splitRes.json().total, 0);

  const childA = splitRes.json().childCheques.find((c) => c.splitLabel === 'Guest A');
  assert.equal(childA.splitAmount, half);
  assert.equal(childA.total, half);

  await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${childA.id}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });

  const childB = splitRes.json().childCheques.find((c) => c.splitLabel === 'Guest B');
  await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${childB.id}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });

  const parentFinal = await app.inject({
    method: 'GET',
    url: `/api/v1/cheques/${parentId}`,
    headers: terminalHeaders,
  });
  assert.equal(parentFinal.json().status, 'paid');
});

test('transfer fired line to another table', async () => {
  await ensureOpenShift();
  const tableA = `TR-A-${Date.now()}`;
  const tableB = `TR-B-${Date.now()}`;

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];
  const modifier = {
    groupId: group.id,
    optionId: option.id,
    nameEn: option.nameEn,
    nameAr: option.nameAr,
    priceDelta: option.priceDelta,
  };

  const openA = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: tableA },
  });
  const chequeA = openA.json().id;
  const draftA = openA.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftA}/items`,
    headers: terminalHeaders,
    payload: { menuItemId, quantity: 1, modifiers: [modifier] },
  });

  const fireA = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeA}/fire`,
    headers: terminalHeaders,
  });
  const itemId = fireA.json().sentOrder.items[0].id;
  assert.ok(fireA.json().cheque.total > 0);

  const transferRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeA}/transfer`,
    headers: terminalHeaders,
    payload: {
      cashierId: CASHIER_ID,
      itemIds: [itemId],
      targetTableLabel: tableB,
      managerPin: '7777',
      reason: 'Wrong table',
    },
  });
  assert.equal(transferRes.statusCode, 200);
  assert.equal(transferRes.json().source.total, 0);
  assert.ok(transferRes.json().target.total > 0);

  const audits = await prisma.chequeItemTransferAudit.findMany({
    where: { sourceChequeId: chequeA },
  });
  assert.equal(audits.length, 1);
});

test('pay without open shift is rejected', async () => {
  await prisma.shift.deleteMany({ where: { cashierId: CASHIER_ID } });

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'NS1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  assert.equal(fireRes.statusCode, 200);

  const payRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payRes.statusCode, 400);
  assert.match(payRes.json().error.message, /shift/i);

  await ensureOpenShift();
});

test('cheque discount reduces total before pay', async () => {
  await ensureOpenShift();
  const tableLabel = `DC-${Date.now()}`;

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  const beforeTotal = fireRes.json().cheque.total;
  assert.ok(beforeTotal > 10);

  const discountRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/discount`,
    headers: terminalHeaders,
    payload: {
      cashierId: CASHIER_ID,
      amount: 10,
      reason: 'Loyalty guest',
      restaurantManagerPin: '7777',
    },
  });
  assert.equal(discountRes.statusCode, 200);
  assert.equal(discountRes.json().discountAmount, 10);
  assert.equal(discountRes.json().total, beforeTotal - 10);

  const payRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payRes.statusCode, 200);
  assert.ok(payRes.json().receipt.includes('Discount'));
  assert.equal(payRes.json().cheque.payments[0].amount, beforeTotal - 10);
});

test('paid cheque refund: venue manager requests, hub manager approves', async () => {
  await ensureOpenShift();
  const tableLabel = `RF-${Date.now()}`;

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });

  const payRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  const paidTotal = payRes.json().cheque.payments[0].amount;

  const requestRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/refund`,
    headers: terminalHeaders,
    payload: {
      cashierId: CASHIER_ID,
      amount: 20,
      method: 'cash',
      reason: 'Wrong item served',
      restaurantManagerPin: '7777',
    },
  });
  assert.equal(requestRes.statusCode, 200);
  assert.equal(requestRes.json().status, 'pending');
  assert.equal(requestRes.json().type, 'refund');

  const detailBefore = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/cheques/${chequeId}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(detailBefore.json().refunds?.length ?? 0, 0);
  assert.ok(detailBefore.json().pendingRefundRequest);

  const pending = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/approvals?venueId=${VENUE_ID}&status=pending`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(pending.statusCode, 200);
  const approval = pending.json().find((r) => r.chequeId === chequeId);
  assert.ok(approval);

  const approveRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/approvals/${approval.id}/approve`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {},
  });
  assert.equal(approveRes.statusCode, 200);
  assert.ok(approveRes.json().receipt.includes('REFUND'));
  assert.equal(approveRes.json().refund.amount, 20);
  assert.equal(approveRes.json().cheque.refunds.length, 1);
  assert.ok(paidTotal >= 20);

  const audits = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/refunds?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(audits.statusCode, 200);
  assert.ok(audits.json().some((r) => r.chequeId === chequeId));
});

test('hub manager can force refund without prior request', async () => {
  await ensureOpenShift();
  const tableLabel = `FR-${Date.now()}`;

  const menuRes = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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
  await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });

  const forceRes = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeId}/refund/force?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { amount: 15, method: 'cash', reason: 'Customer complaint' },
  });
  assert.equal(forceRes.statusCode, 200);
  assert.equal(forceRes.json().refund.amount, 15);
});

test('features endpoint exposes discounts and receipt print flags', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/features',
    headers: terminalHeaders,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.json().discounts, 'boolean');
  assert.equal(typeof res.json().refunds, 'boolean');
  assert.equal(typeof res.json().autoReceiptPrint, 'boolean');
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

test('GET /api/v1/manager/metrics/live requires manager auth', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/manager/metrics/live' });
  assert.equal(res.statusCode, 401);
});

test('hub manager receives live metrics snapshot', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/metrics/live',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.timestamp);
  assert.equal(typeof body.totalRevenueToday, 'number');
  assert.equal(typeof body.totalActiveOrders, 'number');
  assert.equal(typeof body.ordersPerMinute, 'number');
  assert.ok(Array.isArray(body.venues));
  assert.ok(body.venues.some((v) => v.venueId === VENUE_ID));
  const venue = body.venues.find((v) => v.venueId === VENUE_ID);
  assert.ok(venue);
  assert.equal(typeof venue.revenueToday, 'number');
  assert.equal(typeof venue.activeOrders, 'number');
  assert.ok(Array.isArray(venue.openTables));
});

test('venue manager metrics scoped to own venue', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/metrics/live',
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.venues.length, 1);
  assert.equal(body.venues[0].venueId, VENUE_ID);
});

test('GET /api/v1/manager/analytics/revenue returns report for hub manager', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=today',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.currency, 'EGP');
  assert.ok(body.range?.from);
  assert.equal(typeof body.totalRevenue, 'number');
  assert.ok(Array.isArray(body.byVenue));
  assert.ok(body.comparison);
});

test('GET /api/v1/manager/analytics/revenue supports CSV export', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=today&format=csv',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.body, /section,key,name_en/);
});

test('GET /api/v1/manager/analytics/revenue supports custom date range', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=custom&from=2026-06-01&to=2026-06-07',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.range.preset, 'custom');
  assert.ok(body.range.from);
  assert.ok(body.range.to);
  const fromMs = new Date(body.range.from).getTime();
  const toMs = new Date(body.range.to).getTime();
  assert.ok(fromMs <= toMs);
  assert.ok(toMs - fromMs >= 6 * 86_400_000);
});

test('GET /api/v1/manager/analytics/revenue rejects custom without dates', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=custom',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 400);
});

test('venue manager analytics scoped and includes category drill-down', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=month',
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.drillVenueId, VENUE_ID);
  assert.ok(Array.isArray(body.categories));
});

test('GET /api/v1/manager/orders requires manager auth', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/orders',
  });
  assert.equal(res.statusCode, 401);
});

test('GET /api/v1/manager/orders lists orders with pagination', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/orders?venueId=' + VENUE_ID,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.orders));
  assert.equal(body.limit, 50);
  assert.ok(typeof body.total === 'number');
  assert.ok(body.total >= 1);
});

test('GET /api/v1/manager/orders groups results by shift', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&groupBy=shift`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.groupBy, 'shift');
  assert.ok(Array.isArray(body.shifts));
  assert.ok(typeof body.totalCheques === 'number');
  assert.ok(typeof body.totalOrders === 'number');
  if (body.shifts.length > 0) {
    const shift = body.shifts[0];
    assert.ok(Array.isArray(shift.cheques));
    assert.equal(shift.chequeCount, shift.cheques.length);
  }
});

test('GET /api/v1/manager/orders groups results by cheque', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&groupBy=cheque`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.groupBy, 'cheque');
  assert.ok(Array.isArray(body.cheques));
  assert.ok(typeof body.totalOrders === 'number');
  if (body.cheques.length > 0) {
    const group = body.cheques.find((g) => g.chequeId && g.orderCount >= 1);
    if (group) {
      assert.ok(Array.isArray(group.orders));
      assert.equal(group.orderCount, group.orders.length);
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/manager/orders/by-cheque/${group.chequeId}?venueId=${VENUE_ID}`,
        headers: { authorization: `Bearer ${managerToken}` },
      });
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.json().chequeOrders.length, group.orderCount);
    }
  }
});

test('GET /api/v1/manager/orders supports CSV export', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&format=csv`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.body, /order_number,venue,table/);
});

test('GET /api/v1/manager/orders/:id returns detail with items', async () => {
  const list = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  const first = list.json().orders[0];
  assert.ok(first?.id);

  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders/${first.id}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.id, first.id);
  assert.ok(Array.isArray(body.items));
  assert.ok(Array.isArray(body.chequeOrders));
});

test('GET /api/v1/manager/orders filters by cheque number', async () => {
  const list = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  const withCheque = list.json().orders.find((o) => o.chequeNumber != null);
  if (!withCheque) return;

  const filtered = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&chequeNumber=${withCheque.chequeNumber}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(filtered.statusCode, 200);
  assert.ok(filtered.json().orders.length >= 1);
  for (const row of filtered.json().orders) {
    assert.equal(row.chequeNumber, withCheque.chequeNumber);
  }

  const quick = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&q=${withCheque.chequeNumber}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(quick.statusCode, 200);
  assert.ok(quick.json().orders.some((o) => o.chequeNumber === withCheque.chequeNumber));
});

test('GET /api/v1/manager/orders/:id/receipt returns text', async () => {
  const list = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  const first = list.json().orders.find((o) => o.status !== 'draft') ?? list.json().orders[0];
  assert.ok(first?.id);

  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders/${first.id}/receipt?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().text?.length > 0);
});

test('venue manager orders scoped to own venue', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/orders',
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(res.statusCode, 200);
  for (const row of res.json().orders) {
    assert.equal(row.venueId, VENUE_ID);
  }
});

test('GET /api/v1/manager/shifts requires manager auth', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/shifts',
  });
  assert.equal(res.statusCode, 401);
});

test('GET /api/v1/manager/shifts lists shifts with pagination', async () => {
  await ensureOpenShift(500);
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.total >= 1);
  assert.ok(Array.isArray(body.shifts));
  const row = body.shifts[0];
  assert.ok(row.cashierUsername);
  assert.ok(row.terminalName);
  assert.ok(typeof row.expectedCash === 'number');
});

test('GET /api/v1/manager/shifts filters by status=open', async () => {
  await ensureOpenShift(500);
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts?venueId=${VENUE_ID}&status=open`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  for (const row of res.json().shifts) {
    assert.equal(row.status, 'open');
  }
});

test('GET /api/v1/manager/shifts/:id returns detail with report', async () => {
  const list = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts?venueId=${VENUE_ID}&status=open`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  const first = list.json().shifts[0];
  assert.ok(first?.id);

  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts/${first.id}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const detail = res.json();
  assert.equal(detail.id, first.id);
  assert.ok(detail.report);
  assert.ok(detail.paymentsByMethod);
});

test('GET /api/v1/manager/shifts supports CSV export', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts?venueId=${VENUE_ID}&format=csv`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.ok(res.body.includes('cashier,terminal,venue'));
});

test('POST /api/v1/manager/shifts/:id/force-close closes open shift', async () => {
  const shift = await ensureOpenShift(600);
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/shifts/${shift.id}/force-close`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { closeFloat: 600, managerPin: '8888' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().shift.status, 'closed');
  assert.equal(res.json().shift.closeFloat, 600);
});

test('venue manager shifts scoped to own venue', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/shifts',
    headers: { authorization: `Bearer ${venueManagerToken}` },
  });
  assert.equal(res.statusCode, 200);
  for (const row of res.json().shifts) {
    assert.equal(row.venueId, VENUE_ID);
  }
});

test('hub manager can read and update venue config', async () => {
  const getRes = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/venues/${VENUE_ID}/config`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().id, VENUE_ID);

  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/api/v1/manager/venues/${VENUE_ID}/config`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      taxRate: 0.14,
      taxInclusive: true,
      kitchenPrinterHost: '192.168.1.99',
      kitchenPrinterPort: 9100,
      receiptTemplate: 'compact',
      tableLayout: {
        tables: [{ label: 'A1', x: 20, y: 30, seats: 4 }],
      },
    },
  });
  assert.equal(patchRes.statusCode, 200);
  assert.ok(patchRes.json().changes.length >= 1);
  assert.equal(patchRes.json().config.taxRate, 0.14);
  assert.equal(patchRes.json().config.kitchenPrinterHost, '192.168.1.99');

  const audits = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/venues/${VENUE_ID}/config/audits`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(audits.statusCode, 200);
  assert.ok(audits.json().length >= 1);
});

test('terminal can fetch venue settings', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/settings`,
    headers: terminalHeaders,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().venueId, VENUE_ID);
  assert.ok(typeof res.json().taxRate === 'number');
});

test('venue manager cannot patch venue config', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/v1/manager/venues/${VENUE_ID}/config`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
    payload: { taxRate: 0.2 },
  });
  assert.equal(res.statusCode, 403);
});
