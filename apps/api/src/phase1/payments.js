import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixture.js';
import {
  fx,
  VENUE_ID,
  CASHIER_ID,
  terminalHeaders,
  prisma,
  ensureOpenShift,
  getPhase1Modifier,
} from './fixture.js';

test('manual card payment stores optional last-4', async () => {
  await ensureOpenShift();

  const { group, option } = await getPhase1Modifier();

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'MC1' },
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

  const payRes = await fx.app.inject({
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
  const res = await fx.app.inject({
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

  const { group, option } = await getPhase1Modifier();

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'AM1' },
  });
  const parentId = openRes.json().id;
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
    url: `/api/v1/cheques/${parentId}/fire`,
    headers: terminalHeaders,
  });
  const total = fireRes.json().cheque.total;
  const half = Number((total / 2).toFixed(2));
  const rest = Number((total - half).toFixed(2));

  const splitRes = await fx.app.inject({
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

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${childA.id}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });

  const childB = splitRes.json().childCheques.find((c) => c.splitLabel === 'Guest B');
  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${childB.id}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });

  const parentFinal = await fx.app.inject({
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

  const { group, option } = await getPhase1Modifier();
  const modifier = {
    groupId: group.id,
    optionId: option.id,
    nameEn: option.nameEn,
    nameAr: option.nameAr,
    priceDelta: option.priceDelta,
  };

  const openA = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: tableA },
  });
  const chequeA = openA.json().id;
  const draftA = openA.json().draftOrder.id;

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftA}/items`,
    headers: terminalHeaders,
    payload: { menuItemId: fx.menuItemId, quantity: 1, modifiers: [modifier] },
  });

  const fireA = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeA}/fire`,
    headers: terminalHeaders,
  });
  const itemId = fireA.json().sentOrder.items[0].id;
  assert.ok(fireA.json().cheque.total > 0);

  const transferRes = await fx.app.inject({
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

  const { group, option } = await getPhase1Modifier();

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'NS1' },
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
  assert.equal(fireRes.statusCode, 200);

  const payRes = await fx.app.inject({
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

  const { group, option } = await getPhase1Modifier();

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel },
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
  const beforeTotal = fireRes.json().cheque.total;
  assert.ok(beforeTotal > 10);

  const discountRes = await fx.app.inject({
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

  const payRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  assert.equal(payRes.statusCode, 200);
  assert.ok(payRes.json().receipt.includes('Discount'));
  assert.equal(payRes.json().cheque.payments[0].amount, beforeTotal - 10);
});

test('cheque discount can be changed and removed before pay', async () => {
  await ensureOpenShift();
  const tableLabel = `DC2-${Date.now()}`;

  const { group, option } = await getPhase1Modifier();

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel },
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
  const beforeTotal = fireRes.json().cheque.total;

  const applyRes = await fx.app.inject({
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
  assert.equal(applyRes.statusCode, 200);
  assert.equal(applyRes.json().discountAmount, 10);

  const changeRes = await fx.app.inject({
    method: 'PATCH',
    url: `/api/v1/cheques/${chequeId}/discount`,
    headers: terminalHeaders,
    payload: {
      cashierId: CASHIER_ID,
      amount: 15,
      reason: 'Manager adjustment',
      restaurantManagerPin: '7777',
    },
  });
  assert.equal(changeRes.statusCode, 200);
  assert.equal(changeRes.json().discountAmount, 15);
  assert.equal(changeRes.json().total, beforeTotal - 15);

  const removeRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/discount/remove`,
    headers: terminalHeaders,
    payload: {
      cashierId: CASHIER_ID,
      reason: 'Customer changed mind',
      restaurantManagerPin: '7777',
    },
  });
  assert.equal(removeRes.statusCode, 200);
  assert.equal(removeRes.json().discountAmount, 0);
  assert.equal(removeRes.json().total, beforeTotal);

  const activityRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/activity?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(activityRes.statusCode, 200);
  const types = activityRes.json().map((e) => e.type);
  assert.ok(types.includes('discount'));
  assert.ok(types.includes('discount_change'));
  assert.ok(types.includes('discount_remove'));
});

test('paid cheque refund: venue manager applies with PIN', async () => {
  await ensureOpenShift();
  const tableLabel = `RF-${Date.now()}`;

  const { group, option } = await getPhase1Modifier();

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel },
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

  const payRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, method: 'cash' },
  });
  const paidTotal = payRes.json().cheque.payments[0].amount;

  const refundRes = await fx.app.inject({
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
  assert.equal(refundRes.statusCode, 200);
  assert.ok(refundRes.json().receipt.includes('REFUND'));
  assert.equal(refundRes.json().refund.amount, 20);
  assert.equal(refundRes.json().cheque.refunds.length, 1);
  assert.ok(paidTotal >= 20);

  const audits = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/refunds?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(audits.statusCode, 200);
  assert.ok(audits.json().some((r) => r.chequeId === chequeId));
});

test('POS refund rejects hub manager PIN — floor manager only', async () => {
  await ensureOpenShift();
  const tableLabel = `RFHUB-${Date.now()}`;

  const { group, option } = await getPhase1Modifier();

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel },
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

  const refundRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/refund`,
    headers: terminalHeaders,
    payload: {
      cashierId: CASHIER_ID,
      amount: 10,
      method: 'cash',
      reason: 'Hub PIN should fail',
      restaurantManagerPin: '8888',
    },
  });
  assert.equal(refundRes.statusCode, 401);
});

test('features endpoint exposes discounts and receipt print flags', async () => {
  const res = await fx.app.inject({
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
  const res = await fx.app.inject({
    method: 'PATCH',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/items/${fx.menuItemId}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: { isAvailable: false },
  });
  assert.equal(res.statusCode, 200);
  const item = res.json().categories.flatMap((c) => c.items).find((i) => i.id === fx.menuItemId);
  assert.equal(item.isAvailable, false);
});
