import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { hydrateOpenCheques } from './cheque-hydration.js';

describe('hydrateOpenCheques', () => {
  let db;
  let originalFetch;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('mirrors open cheques from cloud into local SQLite', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'cheque-1',
          venueId: 'venue-1',
          cashierId: 'cashier-1',
          terminalId: 'term-1',
          chequeNumber: 42,
          tableLabel: 'Table 5',
          status: 'open',
          discountAmount: 0,
          taxAmount: 0,
          serviceAmount: 0,
          total: 25,
          openedAt: '2026-06-09T12:00:00.000Z',
          orders: [],
          draftOrder: {
            id: 'order-1',
            venueId: 'venue-1',
            cashierId: 'cashier-1',
            status: 'draft',
            openedAt: '2026-06-09T12:00:00.000Z',
            items: [
              {
                id: 'item-1',
                menuItemId: 'menu-1',
                quantity: 2,
                unitPrice: 12.5,
                nameEn: 'Coffee',
                nameAr: 'قهوة',
                modifiersSnapshot: [],
              },
            ],
          },
        },
      ],
    });

    const result = await hydrateOpenCheques({
      db,
      apiUrl: 'http://api',
      venueId: 'venue-1',
      terminalId: 'term-1',
      terminalSecret: 'secret',
    });

    assert.equal(result.hydrated, 1);
    const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get('cheque-1');
    assert.equal(cheque.table_label, 'Table 5');
    assert.equal(cheque.server_id, 'cheque-1');
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all('order-1');
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 2);
  });
});
