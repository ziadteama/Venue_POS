import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertManualCardPaymentsAllowed, cardPaymentTotal } from './services/payment-policy.js';

test('cardPaymentTotal sums card lines only', () => {
  assert.equal(
    cardPaymentTotal([
      { method: 'cash', amount: 50 },
      { method: 'card', amount: 30 },
      { method: 'card', amount: 20 },
    ]),
    50,
  );
});

test('manual card blocked when feature disabled', async () => {
  await assert.rejects(
    () =>
      assertManualCardPaymentsAllowed([{ method: 'card', amount: 10 }], {
        manualCardEnabled: false,
        approvalThreshold: 500,
        venueId: '00000000-0000-4000-8000-000000000001',
      }),
    (err) => err.statusCode === 403,
  );
});

test('cash-only payments skip manual card policy', async () => {
  await assertManualCardPaymentsAllowed([{ method: 'cash', amount: 100 }], {
    manualCardEnabled: false,
    approvalThreshold: 500,
    venueId: '00000000-0000-4000-8000-000000000001',
  });
});
