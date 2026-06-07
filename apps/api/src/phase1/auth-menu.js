import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixture.js';
import {
  fx,
  VENUE_ID,
  CASHIER_ID,
  terminalHeaders,
  prisma,
} from './fixture.js';

test('cashier PIN login works with terminal headers', async () => {
  const res = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin',
    headers: terminalHeaders,
    payload: { pin: '5555' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().user.role, 'cashier');
});

test('manager creates menu with modifier and publishes', async () => {
  const createRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/menu-templates',
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: {
      nameEn: 'Phase1 Menu',
      nameAr: 'قائمة',
      venueIds: [VENUE_ID],
    },
  });
  fx.templateId = createRes.json().id;

  const catRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${fx.templateId}/categories`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: { nameEn: 'Mains', nameAr: 'أطباق', sortOrder: 0 },
  });
  fx.categoryId = catRes.json().categories[0].id;

  const itemRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/categories/${fx.categoryId}/items`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: { nameEn: 'Burger', nameAr: 'برجر', price: 120 },
  });
  fx.menuItemId = itemRes.json().categories[0].items[0].id;

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${fx.templateId}/modifier-groups`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: {
      nameEn: 'Size',
      nameAr: 'حجم',
      minSelection: 1,
      maxSelection: 1,
      menuItemIds: [fx.menuItemId],
      options: [
        { nameEn: 'Large', nameAr: 'كبير', priceDelta: 15 },
        { nameEn: 'Regular', nameAr: 'عادي', priceDelta: 0 },
      ],
    },
  });

  const publishRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${fx.templateId}/publish`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(publishRes.statusCode, 200);
  assert.equal(publishRes.json().status, 'published');
});

test('terminal reads published menu with modifiers', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  assert.equal(res.statusCode, 200);
  const item = res.json().categories[0].items[0];
  assert.ok(item.modifierGroups?.length >= 1);
});

test('order lifecycle: create, add with modifier, qty, send, receipt', async () => {
  const createRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'T5' },
  });
  assert.equal(createRes.statusCode, 200);
  fx.orderId = createRes.json().id;

  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const addRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${fx.orderId}/items`,
    headers: terminalHeaders,
    payload: {
      menuItemId: fx.menuItemId,
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

  const qtyRes = await fx.app.inject({
    method: 'PATCH',
    url: `/api/v1/orders/${fx.orderId}/items/${lineId}`,
    headers: terminalHeaders,
    payload: { quantity: 2 },
  });
  assert.equal(qtyRes.statusCode, 200);
  assert.equal(qtyRes.json().items[0].quantity, 2);

  const tableRes = await fx.app.inject({
    method: 'PATCH',
    url: `/api/v1/orders/${fx.orderId}`,
    headers: terminalHeaders,
    payload: { tableLabel: 'T12' },
  });
  assert.equal(tableRes.statusCode, 200);
  assert.equal(tableRes.json().tableLabel, 'T12');

  const sendRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${fx.orderId}/send`,
    headers: terminalHeaders,
  });
  assert.equal(sendRes.statusCode, 200);
  assert.equal(sendRes.json().tableLabel, 'T12');
  assert.equal(sendRes.json().status, 'sent');
  assert.ok(sendRes.json().sentAt);

  const blocked = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${fx.orderId}/items`,
    headers: terminalHeaders,
    payload: { menuItemId: fx.menuItemId, quantity: 1 },
  });
  assert.equal(blocked.statusCode, 400);

  const receiptRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/orders/${fx.orderId}/receipt`,
    headers: terminalHeaders,
  });
  assert.equal(receiptRes.statusCode, 200);
  assert.ok(receiptRes.json().text.includes('Burger'));
});

test('kitchen orders list returns sent tickets', async () => {
  const kitchenRes = await fx.app.inject({
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
  const listRes = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/kitchen/orders',
    headers: terminalHeaders,
  });
  const ticket = listRes.json().find((o) => o.status === 'sent' && o.items?.length > 0);
  assert.ok(ticket);
  const itemId = ticket.items[0].id;

  for (const status of ['in_progress', 'ready', 'served']) {
    const res = await fx.app.inject({
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
      await fx.app.inject({
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
  const createRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'V1' },
  });
  assert.equal(createRes.statusCode, 200);
  const draftId = createRes.json().id;

  const abandonRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/abandon`,
    headers: terminalHeaders,
  });
  assert.equal(abandonRes.statusCode, 200);
  assert.equal(abandonRes.json().abandoned, true);

  const gone = await prisma.order.findUnique({ where: { id: draftId } });
  assert.equal(gone, null);
});
