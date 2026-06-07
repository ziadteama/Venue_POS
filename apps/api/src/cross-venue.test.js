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

  await seedVenueMenu(ANCHOR_VENUE, 'XCoffee', 50);
  targetMenuItemId = await seedVenueMenu(TARGET_VENUE, 'XBurger', 120);

  const adminUser = await prisma.user.findUnique({ where: { username: 'xadmin' } });
  managerToken = signAccessToken({ sub: adminUser.id, role: 'hub_manager', venue_id: ANCHOR_VENUE });
});

after(async () => {
  await prisma.venueBillingConfig.deleteMany({
    where: { anchorVenueId: ANCHOR_VENUE, targetVenueId: TARGET_VENUE },
  });
  await app.close();
  await prisma.$disconnect();
});

async function openFireCheque(headers, cashierId, menuItemId, table, qty) {
  const open = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers,
    payload: { cashierId, tableLabel: table },
  });
  assert.equal(open.statusCode, 200, open.body);
  const chequeId = open.json().id;
  const draftId = open.json().draftOrder.id;

  const add = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
    headers,
    payload: { menuItemId, quantity: qty },
  });
  assert.equal(add.statusCode, 200, add.body);

  const fire = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers,
  });
  assert.equal(fire.statusCode, 200, fire.body);
  return chequeId;
}

test('hub manager can configure and read the billing matrix', async () => {
  const put = await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { anchorVenueId: ANCHOR_VENUE, targetVenueId: TARGET_VENUE, enabled: true },
  });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(put.json().enabled, true);

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
});

test('target terminal sees no cross-venue targets', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/features', headers: targetHeaders });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().crossVenueBilling, false);
  assert.equal(res.json().crossVenueTargets.length, 0);
});

test('cross-venue settlement: lock, conflict guard, pay, revenue per venue', async () => {
  const targetChequeId = await openFireCheque(targetHeaders, TARGET_CASHIER, targetMenuItemId, 'R1', 2);

  // Order created at target stays attributed to the target venue (kitchen routing).
  const targetOrder = await prisma.order.findFirst({
    where: { venueId: TARGET_VENUE, status: 'sent' },
    orderBy: { sentAt: 'desc' },
  });
  assert.equal(targetOrder.venueId, TARGET_VENUE);

  // Anchor lists billable target cheques.
  const billable = await app.inject({
    method: 'GET',
    url: '/api/v1/cross-venue/billable',
    headers: anchorHeaders,
  });
  assert.equal(billable.statusCode, 200, billable.body);
  const targetVenueEntry = billable.json().venues.find((v) => v.venueId === TARGET_VENUE);
  assert.ok(targetVenueEntry, 'target venue should appear as billable');
  assert.ok(targetVenueEntry.cheques.some((c) => c.id === targetChequeId));

  // Lock the target cheque onto a cross-venue group.
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/cross-venue/groups',
    headers: anchorHeaders,
    payload: { cashierId: ANCHOR_CASHIER, chequeIds: [targetChequeId] },
  });
  assert.equal(create.statusCode, 200, create.body);
  const groupId = create.json().groupId;
  assert.ok(create.json().combinedTotal >= 240);

  // A second attempt to grab the same cheque must conflict (durable lock).
  const conflictRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cross-venue/groups',
    headers: anchorHeaders,
    payload: { cashierId: ANCHOR_CASHIER, chequeIds: [targetChequeId] },
  });
  assert.equal(conflictRes.statusCode, 409, conflictRes.body);

  // Anchor needs an open shift to take the money.
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
    url: `/api/v1/cross-venue/groups/${groupId}/pay`,
    headers: anchorHeaders,
    payload: { cashierId: ANCHOR_CASHIER, method: 'cash', tendered: 300 },
  });
  assert.equal(pay.statusCode, 200, pay.body);
  assert.equal(pay.json().group.status, 'paid');
  assert.ok(pay.json().receipt.includes('CROSS-VENUE'));

  // The target cheque is paid and its payment is attributed to the TARGET venue.
  const paidCheque = await prisma.cheque.findUnique({ where: { id: targetChequeId } });
  assert.equal(paidCheque.status, 'paid');

  const revenueAfter = await prisma.payment.aggregate({
    where: { cheque: { venueId: TARGET_VENUE } },
    _sum: { amount: true },
  });
  const delta = Number(revenueAfter._sum.amount ?? 0) - Number(revenueBefore._sum.amount ?? 0);
  assert.ok(delta >= 240, `target venue revenue should increase by the bill, got ${delta}`);

  // The anchor venue must NOT be credited with the target's revenue.
  const anchorPayment = await prisma.payment.findFirst({
    where: { chequeId: targetChequeId, cheque: { venueId: ANCHOR_VENUE } },
  });
  assert.equal(anchorPayment, null);
});

test('cross-venue billing is rejected for unlinked venues', async () => {
  // Disable the pair, then a fresh target cheque should not be billable.
  await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { anchorVenueId: ANCHOR_VENUE, targetVenueId: TARGET_VENUE, enabled: false },
  });

  const targetChequeId = await openFireCheque(targetHeaders, TARGET_CASHIER, targetMenuItemId, 'R2', 1);
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/cross-venue/groups',
    headers: anchorHeaders,
    payload: { cashierId: ANCHOR_CASHIER, chequeIds: [targetChequeId] },
  });
  assert.equal(create.statusCode, 403, create.body);

  // Re-enable for any later runs.
  await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { anchorVenueId: ANCHOR_VENUE, targetVenueId: TARGET_VENUE, enabled: true },
  });
});
