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

test('cheque split payment: cash + card', async () => {
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
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { managerPin: '8888', reason: 'Wrong table' },
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
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { managerPin: '8888', reason: 'Guest complaint' },
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
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { managerPin: '8888', reason: 'Guest left' },
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
