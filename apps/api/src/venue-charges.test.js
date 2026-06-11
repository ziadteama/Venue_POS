import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVenueCharges } from '../src/utils/venue-charges.js';
import { computeProportionalPaidRefund } from '../src/services/cheque-shared.js';

test('computeVenueCharges adds service then tax on net subtotal', () => {
  const result = computeVenueCharges(100, {
    taxRate: 0.14,
    taxInclusive: false,
    serviceRate: 0.12,
    serviceEnabled: true,
  });
  assert.equal(result.serviceAmount, 12);
  assert.equal(result.taxAmount, 15.68);
  assert.equal(result.total, 127.68);
});

test('computeVenueCharges ignores service when disabled', () => {
  const result = computeVenueCharges(100, {
    taxRate: 0.14,
    taxInclusive: false,
    serviceRate: 0.12,
    serviceEnabled: false,
  });
  assert.equal(result.serviceAmount, 0);
  assert.equal(result.taxAmount, 14);
  assert.equal(result.total, 114);
});

test('computeVenueCharges extracts inclusive tax without adding to total', () => {
  const result = computeVenueCharges(114, {
    taxRate: 0.14,
    taxInclusive: true,
    serviceRate: 0,
    serviceEnabled: false,
  });
  assert.equal(result.taxAmount, 14);
  assert.equal(result.total, 114);
});

test('computeProportionalPaidRefund includes service and tax share', () => {
  const venue = {
    taxRate: 0.14,
    taxInclusive: false,
    serviceRate: 0.12,
    serviceEnabled: true,
  };
  const cheque = {
    discountAmount: 0,
    venue,
    payments: [{ amount: 127.68 }],
    orders: [
      {
        order: {
          status: 'closed',
          items: [
            {
              unitPrice: 100,
              quantity: 1,
              isComped: false,
              modifiersSnapshot: [],
              paidAt: new Date(),
            },
          ],
        },
      },
    ],
  };
  const refund = computeProportionalPaidRefund(cheque, 100);
  assert.equal(refund, 127.68);
});
