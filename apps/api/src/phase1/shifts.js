import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixture.js';
import {
  fx,
  CASHIER_ID,
  terminalHeaders,
  prisma,
  ensureOpenShift,
  clearOpenCheques,
  getPhase1Modifier,
} from './fixture.js';

test('cashier can open and close shift with payment linkage', async () => {
  await clearOpenCheques();
  await prisma.shift.deleteMany({ where: { cashierId: CASHIER_ID } });

  const openRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, openFloat: 200 },
  });
  assert.equal(openRes.statusCode, 200);
  assert.equal(openRes.json().status, 'open');
  assert.equal(openRes.json().openFloat, 200);

  const dupRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, openFloat: 100 },
  });
  assert.equal(dupRes.statusCode, 200);
  assert.equal(dupRes.json().resumed, true);
  assert.equal(dupRes.json().openFloat, 200);

  const { group, option } = await getPhase1Modifier();

  const chequeRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'SH1' },
  });
  const chequeId = chequeRes.json().id;
  const draftId = chequeRes.json().draftOrder.id;

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
  assert.equal(payRes.statusCode, 200);
  const paidTotal = payRes.json().cheque.payments[0].amount;
  assert.ok(paidTotal > 0);

  const activeRes = await fx.app.inject({
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

  const closeRes = await fx.app.inject({
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

test('cannot close shift while open cheques remain', async () => {
  await prisma.shift.deleteMany({ where: { cashierId: CASHIER_ID } });
  await ensureOpenShift(100);

  const chequeRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, tableLabel: 'SH-BLOCK' },
  });
  assert.equal(chequeRes.statusCode, 200);

  const closeRes = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/shifts/close',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, closeFloat: 100 },
  });
  assert.equal(closeRes.statusCode, 400);
  assert.match(closeRes.json().error.message, /open table/i);

  await fx.app.inject({
    method: 'DELETE',
    url: `/api/v1/cheques/${chequeRes.json().id}`,
    headers: terminalHeaders,
  });
});

test('open-context reports open cheques and active shift', async () => {
  await ensureOpenShift(50);

  const ctxRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/shifts/open-context?cashierId=${CASHIER_ID}`,
    headers: terminalHeaders,
  });
  assert.equal(ctxRes.statusCode, 200);
  assert.equal(ctxRes.json().hasActiveShift, true);
  assert.ok(ctxRes.json().activeShift?.id);
});
