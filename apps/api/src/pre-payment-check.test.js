import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';
import { seedPublishedVenueMenu } from './test-helpers/venue-menu-fixture.js';
import { resetHubBilling } from './test-helpers/reset-hub-billing.js';

const VENUE_ID = '00000000-0000-4000-8000-0000000000d1';
const TERMINAL_ID = '00000000-0000-4000-8000-0000000000d2';
const CASHIER_USERNAME = 'prepay_cashier_d1';
const SECRET = 'prepay-test-secret';

const headers = { 'x-terminal-id': TERMINAL_ID, 'x-terminal-secret': SECRET };

let app;
let menuItemId;
let cashierId;

before(async () => {
  ensureKeys();
  await resetHubBilling();
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }) };
  await app.ready();

  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  const secretHash = await hashSecret(SECRET);

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: { isActive: true },
    create: { id: VENUE_ID, nameEn: 'PrePay Venue', nameAr: 'دفع', type: 'standard' },
  });
  const cashier = await prisma.user.upsert({
    where: { username: CASHIER_USERNAME },
    update: {
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
      isActive: true,
    },
    create: {
      id: randomUUID(),
      username: CASHIER_USERNAME,
      passwordHash: pinHash,
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
      isActive: true,
    },
  });
  cashierId = cashier.id;
  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    update: { secretHash, venueId: VENUE_ID, isActive: true },
    create: { id: TERMINAL_ID, venueId: VENUE_ID, name: 'PrePay Till', secretHash },
  });

  const menu = await seedPublishedVenueMenu(prisma, VENUE_ID);
  menuItemId = menu.menuItemId;

  await prisma.cheque.updateMany({
    where: { venueId: VENUE_ID, status: 'open' },
    data: { status: 'voided', closedAt: new Date() },
  });

  await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers,
    payload: { cashierId, openFloat: 100 },
  });
});

after(async () => {
  await app?.close();
});

async function openFireCheque(tableLabel = 'PP-1') {
  const openRes = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers,
    payload: { cashierId, tableLabel, serviceMode: 'dine_in' },
  });
  assert.equal(openRes.statusCode, 200, openRes.body);
  const chequeId = openRes.json().id;
  const draftId = openRes.json().draftOrder.id;

  const addRes = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
    headers,
    payload: { menuItemId, quantity: 2 },
  });
  assert.equal(addRes.statusCode, 200, addRes.body);

  const fireRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers,
  });
  assert.equal(fireRes.statusCode, 200, fireRes.body);
  const sentOrder = fireRes.json().sentOrder;
  const itemId = sentOrder.items[0].id;
  return { chequeId, sentOrderId: sentOrder.id, itemId, cheque: fireRes.json().cheque };
}

test('check-print increments count, audit, and preview copy line', async () => {
  const { chequeId } = await openFireCheque('PP-PRINT');

  const first = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/check-print`,
    headers,
    payload: { cashierId },
  });
  assert.equal(first.statusCode, 200, first.body);
  const body = first.json();
  assert.equal(body.printCount, 1);
  assert.ok(body.text.includes('PRE-PAYMENT CHECK'));
  assert.ok(!body.text.includes('COPY #'));

  const second = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/check-print`,
    headers,
    payload: { cashierId },
  });
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().printCount, 2);
  assert.ok(second.json().text.includes('COPY #2'));

  const audits = await prisma.auditLog.findMany({
    where: { venueId: VENUE_ID, entityId: chequeId },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(audits.length, 2);
  assert.equal(audits[0].action, 'check.print');
  assert.equal(audits[1].action, 'check.reprint');
});

test('pre-pay adjust fired line qty on open cheque', async () => {
  const { chequeId, sentOrderId, itemId } = await openFireCheque('PP-ADJ');

  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/api/v1/cheques/${chequeId}/orders/${sentOrderId}/items/${itemId}`,
    headers,
    payload: { cashierId, quantity: 1 },
  });
  assert.equal(patchRes.statusCode, 200, patchRes.body);
  const line = patchRes
    .json()
    .orders.find((o) => o.id === sentOrderId)
    ?.items.find((i) => i.id === itemId);
  assert.equal(line.quantity, 1);

  const audit = await prisma.auditLog.findFirst({
    where: { venueId: VENUE_ID, action: 'check.pre_pay_adjust', entityId: chequeId },
  });
  assert.ok(audit);
  assert.equal(audit.actorUsername, CASHIER_USERNAME);
});

test('pre-pay adjust rejected on paid cheque', async () => {
  const { chequeId, sentOrderId, itemId } = await openFireCheque('PP-PAID');

  const payRes = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/pay`,
    headers,
    payload: { cashierId, method: 'cash' },
  });
  assert.equal(payRes.statusCode, 200, payRes.body);
  assert.ok(!payRes.json().receipt?.includes('PRE-PAYMENT CHECK'));
  assert.ok(payRes.json().restaurantReceipt?.includes('RESTAURANT COPY'));
  assert.ok(payRes.json().receipt?.includes('Thank you!'));

  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/api/v1/cheques/${chequeId}/orders/${sentOrderId}/items/${itemId}`,
    headers,
    payload: { cashierId, quantity: 1 },
  });
  assert.equal(patchRes.statusCode, 400);
});
