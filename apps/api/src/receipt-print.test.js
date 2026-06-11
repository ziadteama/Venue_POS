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
  const withCard = {
    ...paidCheque,
    payments: [
      { method: 'cash', amount: 50 },
      { method: 'card', amount: 100, cardLast4: '4242' },
    ],
  };
  const text = buildRestaurantReceiptText(withCard, venue, { tendered: 200, change: 50 });
  assert.ok(text.includes('*** RESTAURANT COPY ***'));
  assert.ok(text.includes('For restaurant records'));
  assert.ok(!text.includes('Thank you!'));
  assert.ok(text.includes('Payments:'));
  assert.ok(text.includes('  card: 100.00'));
  assert.ok(!text.includes('4242'));
});

test('buildChequeReceiptText customer copy thanks guest', () => {
  const text = buildChequeReceiptText(paidCheque, venue, { tendered: 200, change: 50 });
  assert.ok(text.includes('Thank you!'));
  assert.ok(!text.includes('RESTAURANT COPY'));
});

test('pre-payment check ends with thank you', () => {
  const text = buildChequeReceiptText(paidCheque, venue, { preview: true, copyNumber: 2 });
  assert.ok(text.includes('PRE-PAYMENT CHECK'));
  assert.ok(text.includes('COPY #2'));
  assert.ok(text.includes('Thank you!'));
});
