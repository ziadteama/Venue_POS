import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordersExplorerToCsv } from './services/order-explorer-service.js';

test('ordersExplorerToCsv includes header and order row', () => {
  const csv = ordersExplorerToCsv({
    orders: [
      {
        orderNumber: 42,
        venueNameEn: 'Cafe',
        tableLabel: 'T5',
        cashierUsername: 'cashier1',
        status: 'closed',
        subtotal: 150,
        chequeNumber: 7,
        paymentMethods: ['cash'],
        openedAt: '2026-06-07T10:00:00.000Z',
        voidReason: null,
      },
    ],
  });
  assert.match(csv, /order_number,venue,table/);
  assert.match(csv, /42,Cafe,T5,cashier1,closed,150,7,cash/);
});

test('ordersExplorerToCsv escapes commas in table label', () => {
  const csv = ordersExplorerToCsv({
    orders: [
      {
        orderNumber: 1,
        venueNameEn: 'Cafe',
        tableLabel: 'VIP, A',
        cashierUsername: 'u',
        status: 'sent',
        subtotal: 10,
        chequeNumber: null,
        paymentMethods: [],
        openedAt: '2026-06-07T10:00:00.000Z',
        voidReason: null,
      },
    ],
  });
  assert.match(csv, /"VIP, A"/);
});
