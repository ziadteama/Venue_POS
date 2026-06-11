import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from './db/prisma.js';
import { HUB_BILLING_ID } from './services/hub-billing-service.js';
import {
  fx,
  CASHIER_ID,
  terminalHeaders,
  ensureOpenShift,
  getPhase1Modifier,
} from './phase1/fixture.js';
import './phase1/fixture.js';

async function withHubTax(rate, fn) {
  await prisma.hubBilling.upsert({
    where: { id: HUB_BILLING_ID },
    create: {
      id: HUB_BILLING_ID,
      taxRate: rate,
      taxInclusive: false,
      serviceEnabled: false,
      serviceRate: 0,
    },
    update: { taxRate: rate, taxInclusive: false, serviceEnabled: false, serviceRate: 0 },
  });
  try {
    await fn();
  } finally {
    const { resetHubBilling } = await import('./test-helpers/reset-hub-billing.js');
    await resetHubBilling();
  }
}

test('split by item: child totals include tax', async () => {
  await withHubTax(0.14, async () => {
    await ensureOpenShift();
    const { group, option } = await getPhase1Modifier();
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
      payload: { cashierId: CASHIER_ID, tableLabel: `TAX-ITEM-${Date.now()}` },
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
    const preSplitTotal = afterSecond.total;
    assert.ok(afterSecond.taxAmount > 0);

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
    const split = splitRes.json();
    const childSum = split.childCheques.reduce((s, c) => s + c.total, 0);

    assert.equal(split.taxAmount, 0);
    assert.ok(Math.abs(childSum - preSplitTotal) < 0.02, 'child totals should sum to pre-split total');
    for (const child of split.childCheques) {
      assert.ok(child.total > 0);
    }
  });
});

test('split by amount: child pay includes tax', async () => {
  await withHubTax(0.14, async () => {
    await ensureOpenShift();
    const { group, option } = await getPhase1Modifier();
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
      payload: { cashierId: CASHIER_ID, tableLabel: `TAX-AMT-${Date.now()}` },
    });
    const parentId = openRes.json().id;
    const draftId = openRes.json().draftOrder.id;

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
    const fired = fireRes.json().cheque;
    const netSubtotal = fired.subtotalBeforeDiscount - (fired.discountAmount ?? 0);
    const half = Number((netSubtotal / 2).toFixed(2));
    const rest = Number((netSubtotal - half).toFixed(2));

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
    const childA = splitRes.json().childCheques[0];
    const expectedChildTotal = Number((half * 1.14).toFixed(2));
    assert.ok(Math.abs(childA.total - expectedChildTotal) < 0.02);

    const payRes = await fx.app.inject({
      method: 'POST',
      url: `/api/v1/cheques/${childA.id}/pay`,
      headers: terminalHeaders,
      payload: { cashierId: CASHIER_ID, method: 'cash' },
    });
    assert.equal(payRes.statusCode, 200);
    assert.ok(Math.abs(payRes.json().cheque.payments[0].amount - expectedChildTotal) < 0.02);
  });
});
