import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChequeReceiptText,
  buildRestaurantReceiptText,
} from './utils/serialize.js';

const venue = { nameEn: 'Demo Cafe' };
const paidCheque = {
  chequeNumber: 7,
  tableLabel: 'T3',
  serviceMode: 'dine_in',
  status: 'paid',
  total: 150,
  subtotalBeforeDiscount: 120,
  discountAmount: 0,
  serviceAmount: 12,
  taxAmount: 18,
  payments: [{ method: 'cash', amount: 150 }],
  orders: [
    {
      orderNumber: 1,
      status: 'closed',
      subtotal: 120,
      items: [
        {
          quantity: 1,
          nameEn: 'Burger',
          unitPrice: 120,
          isComped: false,
          paidAt: '2026-06-11T00:00:00.000Z',
          billingChequeId: null,
          modifiersSnapshot: [],
        },
      ],
    },
  ],
};

test('buildRestaurantReceiptText labels restaurant copy', () => {
  const text = buildRestaurantReceiptText(paidCheque, venue, { tendered: 200, change: 50 });
  assert.ok(text.includes('*** RESTAURANT COPY ***'));
  assert.ok(text.includes('For restaurant records'));
  assert.ok(!text.includes('Thank you!'));
  assert.ok(text.includes('Payments:'));
});

test('buildChequeReceiptText customer copy thanks guest', () => {
  const text = buildChequeReceiptText(paidCheque, venue, { tendered: 200, change: 50 });
  assert.ok(text.includes('Thank you!'));
  assert.ok(!text.includes('RESTAURANT COPY'));
});

test('pre-payment check is not a payment receipt', () => {
  const text = buildChequeReceiptText(paidCheque, venue, { preview: true, copyNumber: 2 });
  assert.ok(text.includes('PRE-PAYMENT CHECK'));
  assert.ok(text.includes('COPY #2'));
  assert.ok(text.includes('Not a payment receipt'));
});
