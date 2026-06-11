import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';
import { publishVenueMenu } from './services/menu-service.js';
import { resetHubBilling } from './test-helpers/reset-hub-billing.js';

const VENUE_ID = '00000000-0000-4000-8000-0000000000f1';
const TERMINAL_ID = '00000000-0000-4000-8000-0000000000f2';
const TERMINAL_SECRET = 'eod-recon-secret';
const FLOOR_PIN = '7777';

const terminalHeaders = { 'x-terminal-id': TERMINAL_ID, 'x-terminal-secret': TERMINAL_SECRET };

let app;
let managerToken;
let ownerToken;
let venueManagerToken;
let menuItems;
let shiftId;
let todayIso;
let cashierId;
let venueMgrId;
let hubMgrId;

const cheques = {};

async function seedMenu() {
  await prisma.venueMenu.upsert({
    where: { venueId: VENUE_ID },
    create: { venueId: VENUE_ID, status: 'draft' },
    update: {},
  });
  let category = await prisma.category.findFirst({ where: { venueId: VENUE_ID } });
  if (!category) {
    category = await prisma.category.create({
      data: { venueId: VENUE_ID, nameEn: 'All', nameAr: 'الكل', sortOrder: 0 },
    });
  }
  const specs = [
    { nameEn: 'Item100', nameAr: 'مئة', price: 100, sortOrder: 0 },
    { nameEn: 'Item40', nameAr: 'أربعون', price: 40, sortOrder: 1 },
    { nameEn: 'Item60', nameAr: 'ستون', price: 60, sortOrder: 2 },
    { nameEn: 'Item50', nameAr: 'خمسون', price: 50, sortOrder: 3 },
  ];
  for (const spec of specs) {
    const existing = await prisma.menuItem.findFirst({
      where: { categoryId: category.id, nameEn: spec.nameEn },
    });
    if (!existing) {
      await prisma.menuItem.create({ data: { categoryId: category.id, ...spec } });
    }
  }
  await publishVenueMenu(VENUE_ID);
  const items = await prisma.menuItem.findMany({ where: { categoryId: category.id } });
  return {
    item100: items.find((i) => i.nameEn === 'Item100').id,
    item40: items.find((i) => i.nameEn === 'Item40').id,
    item60: items.find((i) => i.nameEn === 'Item60').id,
    item50: items.find((i) => i.nameEn === 'Item50').id,
  };
}

async function resetCashierState() {
  await prisma.cheque.updateMany({
    where: { venueId: VENUE_ID, cashierId, status: 'open' },
    data: { status: 'voided', closedAt: new Date() },
  });

  const priorShiftIds = (
    await prisma.shift.findMany({
      where: { venueId: VENUE_ID, cashierId },
      select: { id: true },
    })
  ).map((s) => s.id);

  if (priorShiftIds.length) {
    await prisma.refund.deleteMany({ where: { shiftId: { in: priorShiftIds } } });
    await prisma.payment.deleteMany({ where: { shiftId: { in: priorShiftIds } } });
    await prisma.shiftEvent.deleteMany({ where: { shiftId: { in: priorShiftIds } } });
    await prisma.shift.deleteMany({ where: { id: { in: priorShiftIds } } });
  }
}

async function openTable(tableLabel) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: terminalHeaders,
    payload: { cashierId, tableLabel },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

async function addItem(draftId, menuItemId, quantity = 1) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
    headers: terminalHeaders,
    payload: { menuItemId, quantity },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

async function fireCheque(chequeId) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: terminalHeaders,
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

async function payCheque(chequeId, method) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers: terminalHeaders,
    payload: { cashierId, method },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

before(async () => {
  config.featureManualCardEnabled = true;
  config.featureDiscountsEnabled = true;
  config.featureRefundsEnabled = true;
  ensureKeys();
  await resetHubBilling();
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }) };
  await app.ready();

  const cashierPin = await bcrypt.hash('1234', config.bcryptRounds);
  const floorPinHash = await bcrypt.hash(FLOOR_PIN, config.bcryptRounds);
  const hubPassword = await bcrypt.hash('eodadmin123', config.bcryptRounds);
  const ownerPassword = await bcrypt.hash('owner123', config.bcryptRounds);
  const secretHash = await hashSecret(TERMINAL_SECRET);

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: { isActive: true, serviceEnabled: false, serviceRate: 0 },
    create: {
      id: VENUE_ID,
      nameEn: 'EOD Recon Venue',
      nameAr: 'تسوية',
      type: 'standard',
      serviceEnabled: false,
      serviceRate: 0,
    },
  });

  const cashier = await prisma.user.upsert({
    where: { username: 'eod_cashier' },
    update: { pinHash: cashierPin, role: 'cashier', venueId: VENUE_ID, isActive: true },
    create: {
      id: randomUUID(),
      username: 'eod_cashier',
      pinHash: cashierPin,
      role: 'cashier',
      venueId: VENUE_ID,
    },
  });
  cashierId = cashier.id;

  const venueMgr = await prisma.user.upsert({
    where: { username: 'eod_venue_mgr' },
    update: { pinHash: floorPinHash, role: 'venue_manager', venueId: VENUE_ID, isActive: true },
    create: {
      id: randomUUID(),
      username: 'eod_venue_mgr',
      pinHash: floorPinHash,
      role: 'venue_manager',
      venueId: VENUE_ID,
    },
  });
  venueMgrId = venueMgr.id;

  const hubMgr = await prisma.user.upsert({
    where: { username: 'eod_hub_mgr' },
    update: {
      passwordHash: hubPassword,
      pinHash: floorPinHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
      isActive: true,
    },
    create: {
      id: randomUUID(),
      username: 'eod_hub_mgr',
      passwordHash: hubPassword,
      pinHash: floorPinHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });
  hubMgrId = hubMgr.id;

  await prisma.user.upsert({
    where: { username: 'owner' },
    update: { passwordHash: ownerPassword, role: 'hub_owner', isActive: true },
    create: {
      id: randomUUID(),
      username: 'owner',
      passwordHash: ownerPassword,
      role: 'hub_owner',
      venueId: VENUE_ID,
    },
  });

  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    update: { secretHash, venueId: VENUE_ID, isActive: true },
    create: { id: TERMINAL_ID, venueId: VENUE_ID, name: 'EOD Till', secretHash },
  });

  menuItems = await seedMenu();
  await resetCashierState();

  const mgrLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'eod_hub_mgr', password: 'eodadmin123' },
  });
  assert.equal(mgrLogin.statusCode, 200);
  managerToken = mgrLogin.json().accessToken;

  const ownerLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'owner', password: 'owner123' },
  });
  assert.equal(ownerLogin.statusCode, 200);
  ownerToken = ownerLogin.json().accessToken;

  venueManagerToken = signAccessToken({
    sub: venueMgrId,
    role: 'venue_manager',
    venue_id: VENUE_ID,
  });

  todayIso = new Date().toISOString().slice(0, 10);
});

after(async () => {
  await app.close();
});

test('EOD financial reconciliation — full cashier day agrees across all surfaces', async () => {
  await resetCashierState();

  const OPEN_FLOAT = 500;
  const expected = {
    grossPayments: 0,
    cashPayments: 0,
    cardPayments: 0,
    totalRefunds: 0,
    cashRefunds: 0,
    discountTotal: 0,
  };

  const trackPayment = (payments) => {
    for (const p of payments) {
      const amt = Number(p.amount);
      expected.grossPayments += amt;
      if (p.method === 'cash') expected.cashPayments += amt;
      if (p.method === 'card') expected.cardPayments += amt;
    }
  };

  const trackRefund = (refund) => {
    const amt = Number(refund.amount);
    expected.totalRefunds += amt;
    if (refund.method === 'cash') expected.cashRefunds += amt;
  };

  // 1. Open shift
  const shiftOpen = await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: terminalHeaders,
    payload: { cashierId, openFloat: OPEN_FLOAT },
  });
  assert.equal(shiftOpen.statusCode, 200, shiftOpen.body);
  shiftId = shiftOpen.json().id;
  assert.equal(shiftOpen.json().openFloat, OPEN_FLOAT);

  // 2. Cheque A — clean cash sale (100)
  const chequeA = await openTable('T-EOD-A');
  cheques.A = chequeA.id;
  await addItem(chequeA.draftOrder.id, menuItems.item100, 1);
  await fireCheque(chequeA.id);
  const paidA = await payCheque(chequeA.id, 'cash');
  trackPayment(paidA.cheque.payments);
  assert.equal(paidA.cheque.total, 100);

  // 3. Cheque B — 10% discount, card (pay 90)
  const chequeB = await openTable('T-EOD-B');
  cheques.B = chequeB.id;
  await addItem(chequeB.draftOrder.id, menuItems.item100, 1);
  await fireCheque(chequeB.id);
  const discountB = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeB.id}/discount`,
    headers: terminalHeaders,
    payload: {
      cashierId,
      restaurantManagerPin: FLOOR_PIN,
      reason: 'Loyalty 10%',
      percent: 10,
    },
  });
  assert.equal(discountB.statusCode, 200, discountB.body);
  assert.equal(discountB.json().discountAmount, 10);
  expected.discountTotal += 10;
  const paidB = await payCheque(chequeB.id, 'card');
  trackPayment(paidB.cheque.payments);
  assert.equal(paidB.cheque.total, 90);

  // 4. Cheque C — comp one line, void second round, pay cash (50 after comp)
  const chequeC = await openTable('T-EOD-C');
  cheques.C = chequeC.id;
  await addItem(chequeC.draftOrder.id, menuItems.item40, 1);
  await addItem(chequeC.draftOrder.id, menuItems.item50, 1);
  const firedC1 = await fireCheque(chequeC.id);
  const round1 = firedC1.sentOrder;
  const compLine = round1.items.find((i) => i.menuItemId === menuItems.item40);
  assert.ok(compLine, 'round 1 includes item40 line');
  const compC = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeC.id}/orders/${round1.id}/items/${compLine.id}/comp`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
    payload: { managerPin: FLOOR_PIN, reason: 'Guest complaint' },
  });
  assert.equal(compC.statusCode, 200, compC.body);
  assert.equal(compC.json().total, 50);

  let draftC = firedC1.cheque.draftOrder.id;
  await addItem(draftC, menuItems.item60, 1);
  const firedC2 = await fireCheque(chequeC.id);
  const round2Id = firedC2.sentOrder.id;
  const voidRoundC = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeC.id}/orders/${round2Id}/void`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
    payload: { managerPin: FLOOR_PIN, reason: 'Wrong round' },
  });
  assert.equal(voidRoundC.statusCode, 200, voidRoundC.body);
  assert.equal(voidRoundC.json().total, 50);

  const paidC = await payCheque(chequeC.id, 'cash');
  trackPayment(paidC.cheque.payments);
  assert.equal(paidC.cheque.total, 50);

  // 5. Cheque D — pay cash then partial refund (net 30)
  const chequeD = await openTable('T-EOD-D');
  cheques.D = chequeD.id;
  await addItem(chequeD.draftOrder.id, menuItems.item50, 1);
  await fireCheque(chequeD.id);
  const paidD = await payCheque(chequeD.id, 'cash');
  trackPayment(paidD.cheque.payments);
  const refundD = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeD.id}/refund`,
    headers: terminalHeaders,
    payload: {
      cashierId,
      restaurantManagerPin: FLOOR_PIN,
      reason: 'Partial refund',
      amount: 20,
      method: 'cash',
    },
  });
  assert.equal(refundD.statusCode, 200, refundD.body);
  trackRefund(refundD.json().refund);

  // 6. Cheque E — void entire cheque (zero revenue)
  const chequeE = await openTable('T-EOD-E');
  cheques.E = chequeE.id;
  await addItem(chequeE.draftOrder.id, menuItems.item40, 1);
  await fireCheque(chequeE.id);
  const voidE = await app.inject({
    method: 'POST',
    url: `/api/v1/manager/cheques/${chequeE.id}/void`,
    headers: { authorization: `Bearer ${venueManagerToken}` },
    payload: { managerPin: FLOOR_PIN, reason: 'Guest left' },
  });
  assert.equal(voidE.statusCode, 200, voidE.body);
  assert.equal(voidE.json().status, 'voided');

  // Round expected totals
  expected.grossPayments = Number(expected.grossPayments.toFixed(2));
  expected.cashPayments = Number(expected.cashPayments.toFixed(2));
  expected.cardPayments = Number(expected.cardPayments.toFixed(2));
  expected.totalRefunds = Number(expected.totalRefunds.toFixed(2));
  expected.cashRefunds = Number(expected.cashRefunds.toFixed(2));
  expected.discountTotal = Number(expected.discountTotal.toFixed(2));
  const expectedNet = Number((expected.grossPayments - expected.totalRefunds).toFixed(2));
  const expectedCash = Number(
    (OPEN_FLOAT + expected.cashPayments - expected.cashRefunds).toFixed(2),
  );

  assert.equal(expected.grossPayments, 290);
  assert.equal(expected.totalRefunds, 20);
  assert.equal(expectedNet, 270);
  assert.equal(expected.discountTotal, 10);
  assert.equal(expectedCash, 680);

  // 7. Close shift with intentional small over/short
  const closeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/close',
    headers: terminalHeaders,
    payload: { cashierId, closeFloat: expectedCash + 15 },
  });
  assert.equal(closeRes.statusCode, 200, closeRes.body);
  const closeReport = closeRes.json().report;
  assert.equal(closeReport.overShortAmount, 15);
  assert.equal(closeReport.expectedCash, expectedCash);
  assert.equal(closeReport.totalRefunds, expected.totalRefunds);
  assert.equal(closeReport.discountTotal, expected.discountTotal);
  assert.equal(closeReport.refundsByMethod.cash, expected.cashRefunds);
  assert.equal(closeReport.paymentsByMethod.cash, expected.cashPayments);
  assert.equal(closeReport.paymentsByMethod.card, expected.cardPayments);
  assert.equal(closeReport.totalRevenue, expectedNet);

  // Manager shift detail
  const shiftDetail = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts/${shiftId}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(shiftDetail.statusCode, 200);
  const detail = shiftDetail.json();
  assert.equal(detail.totalRevenue, expectedNet);
  assert.equal(detail.totalRefunds, expected.totalRefunds);
  assert.equal(detail.discountTotal, expected.discountTotal);
  assert.equal(detail.report.totalRevenue, expectedNet);

  // EOD rollup
  const eod = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts/eod?venueId=${VENUE_ID}&date=${todayIso}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(eod.statusCode, 200);
  const eodBody = eod.json();
  const eodShift = eodBody.shifts.find((s) => s.id === shiftId);
  assert.ok(eodShift, 'shift appears on EOD for open day');
  assert.equal(eodShift.totalRevenue, expectedNet);
  assert.equal(eodShift.totalRefunds, expected.totalRefunds);
  assert.equal(eodShift.discountTotal, expected.discountTotal);
  assert.equal(eodBody.netRevenue, expectedNet);
  assert.equal(eodBody.totalRefunds, expected.totalRefunds);
  assert.equal(eodBody.discountTotal, expected.discountTotal);

  // Analytics revenue (CEO / owner)
  const analytics = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/analytics/revenue?preset=today&venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(analytics.statusCode, 200);
  const analyticsBody = analytics.json();
  assert.equal(analyticsBody.totalRevenue, expectedNet);
  const venueRow = analyticsBody.byVenue.find((v) => v.venueId === VENUE_ID);
  assert.ok(venueRow);
  assert.equal(venueRow.revenue, expectedNet);

  // Operations dashboard
  const ops = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/dashboard/operations?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(ops.statusCode, 200);
  const opsToday = ops.json().today;
  assert.equal(opsToday.netRevenue, expectedNet);
  assert.equal(opsToday.totalRefunds, expected.totalRefunds);
  assert.equal(opsToday.discountTotal, expected.discountTotal);
  assert.equal(opsToday.grossRevenue, expected.grossPayments);

  // Cross-check invariant
  assert.equal(analyticsBody.totalRevenue, closeReport.totalRevenue);
  assert.equal(analyticsBody.totalRevenue, eodBody.netRevenue);
  assert.equal(analyticsBody.totalRevenue, opsToday.netRevenue);

  // Cheques surface
  const paidCheques = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/cheques?status=paid&venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(paidCheques.statusCode, 200);
  const paidList = paidCheques.json();
  assert.ok(paidList.some((c) => c.id === cheques.A));
  assert.ok(paidList.some((c) => c.id === cheques.B));
  assert.ok(paidList.some((c) => c.id === cheques.C));
  assert.ok(paidList.some((c) => c.id === cheques.D));
  assert.equal(
    paidList.some((c) => c.id === cheques.E),
    false,
    'voided cheque E must not appear in paid list',
  );

  const chequeBDetail = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/cheques/${cheques.B}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(chequeBDetail.statusCode, 200);
  assert.equal(chequeBDetail.json().discountAmount, 10);

  const chequeDDetail = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/cheques/${cheques.D}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(chequeDDetail.statusCode, 200);
  assert.ok(chequeDDetail.json().refunds?.length >= 1);
  assert.equal(Number(chequeDDetail.json().refunds[0].amount), 20);

  const shiftCheques = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/cheques?status=paid&venueId=${VENUE_ID}&shiftId=${shiftId}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(shiftCheques.statusCode, 200);
  const shiftPaidIds = new Set(shiftCheques.json().map((c) => c.id));
  assert.equal(shiftPaidIds.size, 4);
  for (const key of ['A', 'B', 'C', 'D']) {
    assert.ok(shiftPaidIds.has(cheques[key]), `paid cheque ${key} in shift filter`);
  }

  // Orders explorer grouped by shift
  const ordersShift = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?venueId=${VENUE_ID}&groupBy=shift`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(ordersShift.statusCode, 200);
  const shiftGroup = ordersShift.json().shifts.find((s) => s.shiftId === shiftId);
  assert.ok(shiftGroup, 'orders grouped by shift includes this shift');
  const chequeCTotals = shiftGroup.cheques.find((c) => c.chequeId === cheques.C);
  assert.ok(chequeCTotals);
  assert.equal(chequeCTotals.totalSubtotal, 50);

  const chequeCOrders = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders/by-cheque/${cheques.C}?venueId=${VENUE_ID}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(chequeCOrders.statusCode, 200);
  const cOrders = chequeCOrders.json().chequeOrders;
  const compedLine = cOrders
    .flatMap((o) => o.items)
    .find((i) => i.isComped);
  assert.ok(compedLine);
  assert.equal(compedLine.isComped, true);
  const compedValue = compedLine.isComped
    ? 0
    : Number(compedLine.unitPrice) * compedLine.quantity;
  assert.equal(compedValue, 0);
  const voidedRound = cOrders.find((o) => o.status === 'voided');
  assert.ok(voidedRound, 'voided round visible on orders explorer');
});
