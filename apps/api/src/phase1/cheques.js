import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixture.js';
import {
  fx,
  VENUE_ID,
  TERMINAL_ID,
  TERMINAL_SECRET,
  CASHIER_ID,
  terminalHeaders,
  prisma,
  ensureOpenShift,
  clearOpenCheques,
} from './fixture.js';

test('cheque lifecycle: open, fire two rounds, pay cash', async () => {
  await ensureOpenShift();
  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'C3' },
  });
  assert.equal(openRes.statusCode, 200);
  const chequeId = openRes.json().id;
  let draftId = openRes.json().draftOrder.id;

  const addRound = async (qty) => {
    const addRes = await fx.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${draftId}/items`,
      headers: terminalHeaders,
      payload: {
        menuItemId: fx.menuItemId,
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
    const fireRes = await fx.app.inject({
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

  const payRes = await fx.app.inject({
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

  const resumeRes = await fx.app.inject({
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

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: tableA },
  });
  assert.equal(openRes.statusCode, 200);
  const chequeId = openRes.json().id;
  assert.equal(openRes.json().total ?? 0, 0);

  const deleteRes = await fx.app.inject({
    method: 'DELETE',
    url: `/api/v1/cheques/${chequeId}`,
    headers: terminalHeaders,
  });
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(deleteRes.json().deleted, true);

  const getRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/cheques/${chequeId}`,
    headers: terminalHeaders,
  });
  assert.equal(getRes.statusCode, 404);

  const openRes2 = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: tableB },
  });
  assert.equal(openRes2.statusCode, 200);
  const chequeId2 = openRes2.json().id;

  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];
  let draftId = openRes2.json().draftOrder.id;

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const blockedRes = await fx.app.inject({
    method: 'DELETE',
    url: `/api/v1/cheques/${chequeId2}`,
    headers: terminalHeaders,
  });
  assert.equal(blockedRes.statusCode, 400);
});

test('cheque open resumes same table and merges orphan draft items', async () => {
  await ensureOpenShift();
  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const uid = `${Date.now()}`.slice(-8);
  const table = `MR${uid}`;

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: table },
  });
  assert.equal(openRes.statusCode, 200);
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  const addRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const otherTable = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: `${table}X` },
  });
  assert.equal(otherTable.statusCode, 200);

  const resumeRes = await fx.app.inject({
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
  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'S1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  const total = fireRes.json().cheque.total;
  const cashPart = Math.round(total * 0.4 * 100) / 100;
  const cardPart = Math.round((total - cashPart) * 100) / 100;

  const payRes = await fx.app.inject({
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
  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'M1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  const sentOrderId = fireRes.json().sentOrder.id;

  const voidRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeId}/orders/${sentOrderId}/void`,
    headers: { authorization: `Bearer ${fx.venueManagerToken}` },
    payload: { managerPin: '7777', reason: 'Wrong table' },
  });
  assert.equal(voidRes.statusCode, 200);
  const voided = voidRes.json().orders.find((o) => o.id === sentOrderId);
  assert.equal(voided.status, 'voided');
  assert.equal(voidRes.json().total, 0);

  const listRes = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/cheques/open',
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.ok(listRes.json().some((c) => c.id === chequeId));
});

test('manager can comp a line item on open cheque', async () => {
  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'CP1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  const fireRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  const sentOrder = fireRes.json().sentOrder;
  const itemId = sentOrder.items[0].id;
  const totalBefore = fireRes.json().cheque.total;
  assert.ok(totalBefore > 0);

  const compRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeId}/orders/${sentOrder.id}/items/${itemId}/comp`,
    headers: { authorization: `Bearer ${fx.venueManagerToken}` },
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
  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  const group = menuRes.json().categories[0].items[0].modifierGroups[0];
  const option = group.options[0];

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'PH1' },
  });
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
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

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });

  const paidListRes = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/cheques?status=paid',
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(paidListRes.statusCode, 200);
  const paidCheque = paidListRes.json().find((c) => c.id === chequeId);
  assert.ok(paidCheque);
  assert.equal(paidCheque.status, 'paid');
  assert.ok(paidCheque.payments.length >= 1);
});

test('manager can void entire open cheque', async () => {
  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'M2' },
  });
  const chequeId = openRes.json().id;

  const voidRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeId}/void`,
    headers: { authorization: `Bearer ${fx.venueManagerToken}` },
    payload: { managerPin: '7777', reason: 'Guest left' },
  });
  assert.equal(voidRes.statusCode, 200);
  assert.equal(voidRes.json().status, 'voided');

  const listRes = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/cheques/open',
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(
    listRes.json().some((c) => c.id === chequeId),
    false,
  );
});

test('cheque split by item: pay sub-cheques closes parent', async () => {
  await ensureOpenShift();
  const menuRes = await fx.app.inject({
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

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'SP1' },
  });
  const parentId = openRes.json().id;
  let draftId = openRes.json().draftOrder.id;

  const fireRound = async () => {
    await fx.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${draftId}/items`,
      headers: terminalHeaders,
      payload: { menuItemId: fx.menuItemId, quantity: 1, modifiers: [modifier] },
    });
    const fireRes = await fx.app.inject({
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

  const splitRes = await fx.app.inject({
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

  const payA = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${childA.id}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payA.statusCode, 200);
  assert.equal(payA.json().cheque.status, 'paid');

  const parentMid = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/cheques/${parentId}`,
    headers: terminalHeaders,
  });
  assert.equal(parentMid.json().status, 'open');

  const payB = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${childB.id}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payB.statusCode, 200);

  const parentFinal = await fx.app.inject({
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
