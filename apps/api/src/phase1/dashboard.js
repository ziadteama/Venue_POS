import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixture.js';
import {
  fx,
  VENUE_ID,
  TERMINAL_ID,
  TERMINAL_SECRET,
  terminalHeaders,
  ensureOpenShift,
} from './fixture.js';

test('GET /api/v1/manager/metrics/live requires manager auth', async () => {
  const res = await fx.app.inject({ method: 'GET', url: '/api/v1/manager/metrics/live' });
  assert.equal(res.statusCode, 401);
});

test('hub owner receives live metrics snapshot', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/metrics/live',
    headers: { authorization: `Bearer ${fx.ownerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.timestamp);
  assert.equal(typeof body.totalRevenueToday, 'number');
  assert.equal(typeof body.totalActiveOrders, 'number');
  assert.equal(typeof body.ordersPerMinute, 'number');
  assert.ok(Array.isArray(body.venues));
  assert.ok(body.venues.some((v) => v.venueId === VENUE_ID));
  const venue = body.venues.find((v) => v.venueId === VENUE_ID);
  assert.ok(venue);
  assert.equal(typeof venue.revenueToday, 'number');
  assert.equal(typeof venue.activeOrders, 'number');
  assert.ok(Array.isArray(venue.openTables));
});

test('hub manager cannot access owner metrics', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/metrics/live',
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('venue manager cannot access web metrics', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/metrics/live',
    headers: { authorization: `Bearer ${fx.venueManagerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('GET /api/v1/manager/analytics/revenue returns report for hub owner', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=today',
    headers: { authorization: `Bearer ${fx.ownerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.currency, 'EGP');
  assert.ok(body.range?.from);
  assert.equal(typeof body.totalRevenue, 'number');
  assert.ok(Array.isArray(body.byVenue));
  assert.ok(body.comparison);
});

test('GET /api/v1/manager/analytics/revenue supports CSV export', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=today&format=csv',
    headers: { authorization: `Bearer ${fx.ownerToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.body, /section,key,name_en/);
});

test('GET /api/v1/manager/analytics/revenue supports custom date range', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=custom&from=2026-06-01&to=2026-06-07',
    headers: { authorization: `Bearer ${fx.ownerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.range.preset, 'custom');
  assert.ok(body.range.from);
  assert.ok(body.range.to);
  const fromMs = new Date(body.range.from).getTime();
  const toMs = new Date(body.range.to).getTime();
  assert.ok(fromMs <= toMs);
  assert.ok(toMs - fromMs >= 6 * 86_400_000);
});

test('GET /api/v1/manager/analytics/revenue rejects custom without dates', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=custom',
    headers: { authorization: `Bearer ${fx.ownerToken}` },
  });
  assert.equal(res.statusCode, 400);
});

test('venue manager cannot access web analytics', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=month',
    headers: { authorization: `Bearer ${fx.venueManagerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('hub manager cannot access CEO analytics', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/analytics/revenue?preset=today',
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('GET /api/v1/manager/orders requires manager auth', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/orders',
  });
  assert.equal(res.statusCode, 401);
});

test('GET /api/v1/manager/orders lists orders with pagination', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/orders?venueId=' + VENUE_ID,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.orders));
  assert.equal(body.limit, 50);
  assert.ok(typeof body.total === 'number');
  assert.ok(body.total >= 1);
});

test('GET /api/v1/manager/orders groups results by shift', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&groupBy=shift`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.groupBy, 'shift');
  assert.ok(Array.isArray(body.shifts));
  assert.ok(typeof body.totalCheques === 'number');
  assert.ok(typeof body.totalOrders === 'number');
  if (body.shifts.length > 0) {
    const shift = body.shifts[0];
    assert.ok(Array.isArray(shift.cheques));
    assert.equal(shift.chequeCount, shift.cheques.length);
  }
});

test('GET /api/v1/manager/orders groups results by cheque', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&groupBy=cheque`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.groupBy, 'cheque');
  assert.ok(Array.isArray(body.cheques));
  assert.ok(typeof body.totalOrders === 'number');
  if (body.cheques.length > 0) {
    const group = body.cheques.find((g) => g.chequeId && g.orderCount >= 1);
    if (group) {
      assert.ok(Array.isArray(group.orders));
      assert.equal(group.orderCount, group.orders.length);
      const detail = await fx.app.inject({
        method: 'GET',
        url: `/api/v1/manager/orders/by-cheque/${group.chequeId}?venueId=${VENUE_ID}`,
        headers: { authorization: `Bearer ${fx.managerToken}` },
      });
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.json().chequeOrders.length, group.orderCount);
    }
  }
});

test('GET /api/v1/manager/orders supports CSV export', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&format=csv`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.body, /order_number,venue,table/);
});

test('GET /api/v1/manager/orders/:id returns detail with items', async () => {
  const list = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  const first = list.json().orders[0];
  assert.ok(first?.id);

  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders/${first.id}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.id, first.id);
  assert.ok(Array.isArray(body.items));
  assert.ok(Array.isArray(body.chequeOrders));
});

test('GET /api/v1/manager/orders filters by cheque number', async () => {
  const list = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  const withCheque = list.json().orders.find((o) => o.chequeNumber != null);
  if (!withCheque) return;

  const filtered = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&chequeNumber=${withCheque.chequeNumber}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(filtered.statusCode, 200);
  assert.ok(filtered.json().orders.length >= 1);
  for (const row of filtered.json().orders) {
    assert.equal(row.chequeNumber, withCheque.chequeNumber);
  }

  const quick = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&q=${withCheque.chequeNumber}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(quick.statusCode, 200);
  assert.ok(quick.json().orders.some((o) => o.chequeNumber === withCheque.chequeNumber));
});

test('GET /api/v1/manager/orders/:id/receipt returns text', async () => {
  const list = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  const first = list.json().orders.find((o) => o.status !== 'draft') ?? list.json().orders[0];
  assert.ok(first?.id);

  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders/${first.id}/receipt?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().text?.length > 0);
});

test('venue manager cannot use web order explorer API', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/orders',
    headers: { authorization: `Bearer ${fx.venueManagerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('CEO cannot use web order explorer API', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/orders',
    headers: { authorization: `Bearer ${fx.ownerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('terminal can search order history for its venue', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/terminal/order-explorer?groupBy=cheque&limit=5',
    headers: {
      'x-terminal-id': TERMINAL_ID,
      'x-terminal-secret': TERMINAL_SECRET,
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().groupBy, 'cheque');
  assert.ok(Array.isArray(res.json().cheques));
});

test('GET /api/v1/manager/shifts requires manager auth', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/shifts',
  });
  assert.equal(res.statusCode, 401);
});

test('GET /api/v1/manager/shifts lists shifts with pagination', async () => {
  await ensureOpenShift(500);
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.total >= 1);
  assert.ok(Array.isArray(body.shifts));
  const row = body.shifts[0];
  assert.ok(row.cashierUsername);
  assert.ok(row.terminalName);
  assert.ok(typeof row.expectedCash === 'number');
});

test('GET /api/v1/manager/shifts filters by status=open', async () => {
  await ensureOpenShift(500);
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts?venueId=${VENUE_ID}&status=open`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  for (const row of res.json().shifts) {
    assert.equal(row.status, 'open');
  }
});

test('GET /api/v1/manager/shifts/:id returns detail with report', async () => {
  const list = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts?venueId=${VENUE_ID}&status=open`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  const first = list.json().shifts[0];
  assert.ok(first?.id);

  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts/${first.id}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const detail = res.json();
  assert.equal(detail.id, first.id);
  assert.ok(detail.report);
  assert.ok(detail.paymentsByMethod);
  assert.equal(typeof detail.totalRevenue, 'number');
});

test('GET /api/v1/manager/shifts CSV export is owner account only', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts?venueId=${VENUE_ID}&format=csv`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('POST /api/v1/manager/shifts/:id/force-close closes open shift', async () => {
  const shift = await ensureOpenShift(600);
  const res = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/manager/shifts/${shift.id}/force-close`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: { closeFloat: 600, managerPin: '8888' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().shift.status, 'closed');
  assert.equal(res.json().shift.closeFloat, 600);
});

test('venue manager cannot access web shifts API', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/manager/shifts',
    headers: { authorization: `Bearer ${fx.venueManagerToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test('hub manager can read and update venue config', async () => {
  const getRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/venues/${VENUE_ID}/config`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().id, VENUE_ID);

  const hubBillingRes = await fx.app.inject({
    method: 'PATCH',
    url: '/api/v1/manager/hub/billing',
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: {
      taxRate: 0.14,
      taxInclusive: true,
      serviceRate: 0.12,
      serviceEnabled: true,
    },
  });
  assert.equal(hubBillingRes.statusCode, 200);
  assert.equal(hubBillingRes.json().taxRate, 0.14);
  assert.equal(hubBillingRes.json().serviceRate, 0.12);
  assert.equal(hubBillingRes.json().serviceEnabled, true);

  const patchRes = await fx.app.inject({
    method: 'PATCH',
    url: `/api/v1/manager/venues/${VENUE_ID}/config`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: {
      kitchenPrinterHost: '192.168.1.199',
      kitchenPrinterPort: 9100,
      receiptTemplate: 'compact',
    },
  });
  assert.equal(patchRes.statusCode, 200);
  assert.ok(patchRes.json().changes.length >= 1);
  assert.equal(patchRes.json().config.taxRate, 0.14);
  assert.equal(patchRes.json().config.serviceRate, 0.12);
  assert.equal(patchRes.json().config.serviceEnabled, true);
  assert.equal(patchRes.json().config.kitchenPrinterHost, '192.168.1.199');

  const audits = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/manager/venues/${VENUE_ID}/config/audits`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(audits.statusCode, 200);
  assert.ok(audits.json().length >= 1);
});

test('terminal can fetch venue settings', async () => {
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/settings`,
    headers: terminalHeaders,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().venueId, VENUE_ID);
  assert.ok(typeof res.json().taxRate === 'number');
});

test('hub manager can create a new restaurant', async () => {
  const res = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/manager/venues',
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: {
      nameEn: 'Test Bistro',
      nameAr: 'مطعم تجريبي',
      type: 'standard',
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.nameEn, 'Test Bistro');
  assert.equal(body.nameAr, 'مطعم تجريبي');
  assert.equal(body.type, 'standard');
  assert.ok(body.id);

  const listRes = await fx.app.inject({
    method: 'GET',
    url: '/api/v1/venues',
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.ok(listRes.json().some((v) => v.id === body.id));
});

test('hub owner cannot create restaurants', async () => {
  const res = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/manager/venues',
    headers: { authorization: `Bearer ${fx.ownerToken}` },
    payload: { nameEn: 'Blocked', nameAr: 'محظور' },
  });
  assert.equal(res.statusCode, 403);
});

test('venue manager cannot patch venue config', async () => {
  const res = await fx.app.inject({
    method: 'PATCH',
    url: `/api/v1/manager/venues/${VENUE_ID}/config`,
    headers: { authorization: `Bearer ${fx.venueManagerToken}` },
    payload: { kitchenPrinterHost: '10.0.0.1' },
  });
  assert.equal(res.statusCode, 403);
});
