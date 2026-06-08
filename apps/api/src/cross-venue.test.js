import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';
import { publishMenuTemplate } from './services/menu-service.js';

const ANCHOR_VENUE = '00000000-0000-4000-8000-0000000000a0';
const TARGET_VENUE = '00000000-0000-4000-8000-0000000000a1';
const ANCHOR_TERMINAL = '00000000-0000-4000-8000-0000000000a2';
const TARGET_TERMINAL = '00000000-0000-4000-8000-0000000000a3';
const ANCHOR_CASHIER = '00000000-0000-4000-8000-0000000000a4';
const TARGET_CASHIER = '00000000-0000-4000-8000-0000000000a5';
const TERMINAL_SECRET = 'cross-venue-secret';

const anchorHeaders = { 'x-terminal-id': ANCHOR_TERMINAL, 'x-terminal-secret': TERMINAL_SECRET };
const targetHeaders = { 'x-terminal-id': TARGET_TERMINAL, 'x-terminal-secret': TERMINAL_SECRET };

let app;
let managerToken;
let anchorMenuItemId;
let targetMenuItemId;

async function seedVenueMenu(venueId, nameEn, price) {
  const template = await prisma.menuTemplate.create({
    data: {
      nameEn: `${nameEn} Menu ${venueId.slice(-4)}`,
      nameAr: 'قائمة',
      venues: { create: [{ venueId }] },
      categories: {
        create: [
          {
            nameEn: 'All',
            nameAr: 'الكل',
            sortOrder: 0,
            items: { create: [{ nameEn, nameAr: nameEn, price, sortOrder: 0 }] },
          },
        ],
      },
    },
    include: { categories: { include: { items: true } } },
  });
  await publishMenuTemplate(template.id);
  return template.categories[0].items[0].id;
}

async function enableBilling() {
  await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { anchorVenueId: ANCHOR_VENUE, targetVenueId: TARGET_VENUE, enabled: true },
  });
}

before(async () => {
  ensureKeys();
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }) };
  await app.ready();

  const secretHash = await hashSecret(TERMINAL_SECRET);
  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  const adminHash = await bcrypt.hash('xadmin123', config.bcryptRounds);

  await prisma.venue.upsert({
    where: { id: ANCHOR_VENUE },
    update: { type: 'anchor', isActive: true, serviceEnabled: false, serviceRate: 0, taxRate: 0 },
    create: { id: ANCHOR_VENUE, nameEn: 'XAnchor', nameAr: 'مرساة', type: 'anchor' },
  });
  await prisma.venue.upsert({
    where: { id: TARGET_VENUE },
    update: { type: 'standard', isActive: true, serviceEnabled: false, serviceRate: 0, taxRate: 0 },
    create: { id: TARGET_VENUE, nameEn: 'XTarget', nameAr: 'هدف', type: 'standard' },
  });

  await prisma.user.upsert({
    where: { username: 'xadmin' },
    update: { passwordHash: adminHash, role: 'hub_manager', venueId: ANCHOR_VENUE },
    create: { username: 'xadmin', passwordHash: adminHash, role: 'hub_manager', venueId: ANCHOR_VENUE },
  });
  await prisma.user.upsert({
    where: { id: ANCHOR_CASHIER },
    update: { username: 'xanchorcashier', pinHash, role: 'cashier', venueId: ANCHOR_VENUE, isActive: true },
    create: { id: ANCHOR_CASHIER, username: 'xanchorcashier', pinHash, role: 'cashier', venueId: ANCHOR_VENUE },
  });
  await prisma.user.upsert({
    where: { id: TARGET_CASHIER },
    update: { username: 'xtargetcashier', pinHash, role: 'cashier', venueId: TARGET_VENUE, isActive: true },
    create: { id: TARGET_CASHIER, username: 'xtargetcashier', pinHash, role: 'cashier', venueId: TARGET_VENUE },
  });

  await prisma.terminal.upsert({
    where: { id: ANCHOR_TERMINAL },
    update: { secretHash, venueId: ANCHOR_VENUE, isActive: true },
    create: { id: ANCHOR_TERMINAL, venueId: ANCHOR_VENUE, name: 'XAnchorPOS', secretHash },
  });
  await prisma.terminal.upsert({
    where: { id: TARGET_TERMINAL },
    update: { secretHash, venueId: TARGET_VENUE, isActive: true },
    create: { id: TARGET_TERMINAL, venueId: TARGET_VENUE, name: 'XTargetPOS', secretHash },
  });

  anchorMenuItemId = await seedVenueMenu(ANCHOR_VENUE, 'XCoffee', 50);
  targetMenuItemId = await seedVenueMenu(TARGET_VENUE, 'XBurger', 120);

  const adminUser = await prisma.user.findUnique({ where: { username: 'xadmin' } });
  managerToken = signAccessToken({ sub: adminUser.id, role: 'hub_manager', venue_id: ANCHOR_VENUE });

  await enableBilling();
});

after(async () => {
  await prisma.venueBillingConfig.deleteMany({
    where: { anchorVenueId: ANCHOR_VENUE, targetVenueId: TARGET_VENUE },
  });
  await app.close();
  await prisma.$disconnect();
});

test('hub manager can configure and read the billing matrix', async () => {
  const get = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(get.statusCode, 200);
  const pair = get
    .json()
    .pairs.find((p) => p.anchorVenueId === ANCHOR_VENUE && p.targetVenueId === TARGET_VENUE);
  assert.ok(pair, 'configured pair should appear in matrix');
  assert.equal(pair.enabled, true);
});

test('a venue cannot be configured to bill itself', async () => {
  const put = await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { anchorVenueId: ANCHOR_VENUE, targetVenueId: ANCHOR_VENUE, enabled: true },
  });
  assert.equal(put.statusCode, 400);
});

test('standard (non-anchor) venue cannot be an anchor', async () => {
  const put = await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { anchorVenueId: TARGET_VENUE, targetVenueId: ANCHOR_VENUE, enabled: true },
  });
  assert.equal(put.statusCode, 400);
});

test('anchor terminal features expose configured cross-venue targets', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/features', headers: anchorHeaders });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.isAnchor, true);
  assert.equal(body.crossVenueBilling, true);
  assert.ok(body.crossVenueTargets.some((v) => v.id === TARGET_VENUE));
  assert.equal(body.anchorVenue?.id, ANCHOR_VENUE);
});

test('target terminal sees no cross-venue targets', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/features', headers: targetHeaders });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().crossVenueBilling, false);
  assert.equal(res.json().crossVenueTargets.length, 0);
});

test('unified cross-venue ordering: lazy attach, per-venue cheques, fire, pay', async () => {
  const open = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: anchorHeaders,
    payload: { cashierId: ANCHOR_CASHIER, tableLabel: 'CV1' },
  });
  assert.equal(open.statusCode, 200, open.body);
  const anchorChequeId = open.json().id;
  assert.equal(open.json().crossVenueGroupId, null);

  const menu = await app.inject({
    method: 'GET',
    url: `/api/v1/cross-venue/menu/${TARGET_VENUE}`,
    headers: anchorHeaders,
  });
  assert.equal(menu.statusCode, 200, menu.body);
  assert.ok(menu.json().categories?.length);

  const addAnchor = await app.inject({
    method: 'POST',
    url: `/api/v1/cross-venue/cheques/${anchorChequeId}/items`,
    headers: anchorHeaders,
    payload: {
      cashierId: ANCHOR_CASHIER,
      venueId: ANCHOR_VENUE,
      menuItemId: anchorMenuItemId,
      quantity: 1,
    },
  });
  assert.equal(addAnchor.statusCode, 200, addAnchor.body);
  assert.equal(addAnchor.json().group, null);

  const addTarget = await app.inject({
    method: 'POST',
    url: `/api/v1/cross-venue/cheques/${anchorChequeId}/items`,
    headers: anchorHeaders,
    payload: {
      cashierId: ANCHOR_CASHIER,
      venueId: TARGET_VENUE,
      menuItemId: targetMenuItemId,
      quantity: 2,
    },
  });
  assert.equal(addTarget.statusCode, 200, addTarget.body);
  const groupId = addTarget.json().group.groupId;
  assert.ok(groupId);
  assert.equal(addTarget.json().group.cheques.length, 2);
  const venueIds = addTarget.json().group.cheques.map((c) => c.venueId).sort();
  assert.deepEqual(venueIds, [ANCHOR_VENUE, TARGET_VENUE].sort());

  const wrongVenueItem = await app.inject({
    method: 'POST',
    url: `/api/v1/cross-venue/cheques/${anchorChequeId}/items`,
    headers: anchorHeaders,
    payload: {
      cashierId: ANCHOR_CASHIER,
      venueId: TARGET_VENUE,
      menuItemId: anchorMenuItemId,
      quantity: 1,
    },
  });
  assert.equal(wrongVenueItem.statusCode, 400, wrongVenueItem.body);

  const fire = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${anchorChequeId}/fire`,
    headers: anchorHeaders,
  });
  assert.equal(fire.statusCode, 200, fire.body);
  assert.equal(fire.json().sentOrders.length, 2);

  for (const order of fire.json().sentOrders) {
    assert.ok([ANCHOR_VENUE, TARGET_VENUE].includes(order.venueId));
    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    assert.equal(dbOrder.venueId, order.venueId);
  }

  const shift = await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: anchorHeaders,
    payload: { cashierId: ANCHOR_CASHIER, openFloat: 500 },
  });
  assert.ok([200, 409].includes(shift.statusCode), shift.body);

  const revenueBefore = await prisma.payment.aggregate({
    where: { cheque: { venueId: TARGET_VENUE } },
    _sum: { amount: true },
  });

  const pay = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${anchorChequeId}/pay`,
    headers: anchorHeaders,
    payload: { cashierId: ANCHOR_CASHIER, method: 'cash', tendered: 500 },
  });
  assert.equal(pay.statusCode, 200, pay.body);
  assert.ok(pay.json().receipt?.includes('CROSS-VENUE') || pay.json().text?.includes('CROSS-VENUE'));

  const anchorPayment = await prisma.payment.findFirst({
    where: { cheque: { venueId: ANCHOR_VENUE, crossVenueGroupId: groupId } },
  });
  const targetPayment = await prisma.payment.findFirst({
    where: { cheque: { venueId: TARGET_VENUE, crossVenueGroupId: groupId } },
  });
  assert.ok(anchorPayment, 'anchor venue should have a payment row');
  assert.ok(targetPayment, 'target venue should have a payment row');
  assert.ok(Number(targetPayment.amount) >= 240);

  const revenueAfter = await prisma.payment.aggregate({
    where: { cheque: { venueId: TARGET_VENUE } },
    _sum: { amount: true },
  });
  const delta = Number(revenueAfter._sum.amount ?? 0) - Number(revenueBefore._sum.amount ?? 0);
  assert.ok(delta >= 240, `target venue revenue should increase, got ${delta}`);
});

test('cross-venue ordering rejects unlinked target venue', async () => {
  await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { anchorVenueId: ANCHOR_VENUE, targetVenueId: TARGET_VENUE, enabled: false },
  });

  const open = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: anchorHeaders,
    payload: { cashierId: ANCHOR_CASHIER, tableLabel: 'CV2' },
  });
  assert.equal(open.statusCode, 200, open.body);

  const addTarget = await app.inject({
    method: 'POST',
    url: `/api/v1/cross-venue/cheques/${open.json().id}/items`,
    headers: anchorHeaders,
    payload: {
      cashierId: ANCHOR_CASHIER,
      venueId: TARGET_VENUE,
      menuItemId: targetMenuItemId,
      quantity: 1,
    },
  });
  assert.equal(addTarget.statusCode, 403, addTarget.body);

  await enableBilling();
});
