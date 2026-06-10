import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';
import { seedPublishedVenueMenu } from './test-helpers/venue-menu-fixture.js';

const VENUE_A = '00000000-0000-4000-8000-0000000000c8';
const VENUE_B = '00000000-0000-4000-8000-0000000000c9';
const TERMINAL_A = '00000000-0000-4000-8000-0000000000ca';
const TERMINAL_B = '00000000-0000-4000-8000-0000000000cb';
const CASHIER_A = '00000000-0000-4000-8000-0000000000cc';
const CASHIER_B = '00000000-0000-4000-8000-0000000000cd';
const MANAGER_ID = '00000000-0000-4000-8000-0000000000ce';
const SECRET = 'hub-tables-secret';

const headersA = { 'x-terminal-id': TERMINAL_A, 'x-terminal-secret': SECRET };
const headersB = { 'x-terminal-id': TERMINAL_B, 'x-terminal-secret': SECRET };

let app;
let managerToken;
let menuItemA;
let menuItemB;

async function ensureHubTable(label) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/manager/hub/tables',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { tableLabel: label },
  });
  if (res.statusCode === 200) return res.json();
  const list = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/hub/tables',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  return list.json().find((t) => t.tableLabel.toLowerCase() === label.toLowerCase());
}

before(async () => {
  config.featureCrossVenueBilling = true;
  ensureKeys();
  app = await buildApp();
  app.io = { to: () => ({ emit: () => {} }) };
  await app.ready();

  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  const adminHash = await bcrypt.hash('xadmin123', config.bcryptRounds);
  const secretHash = await hashSecret(SECRET);

  await prisma.venue.upsert({
    where: { id: VENUE_A },
    update: { type: 'anchor', isActive: true },
    create: { id: VENUE_A, nameEn: 'Hub Cafe', nameAr: 'كافيه', type: 'anchor' },
  });
  await prisma.venue.upsert({
    where: { id: VENUE_B },
    update: { type: 'standard', isActive: true },
    create: { id: VENUE_B, nameEn: 'Hub Rest', nameAr: 'مطعم', type: 'standard' },
  });

  await prisma.user.upsert({
    where: { username: 'hub_tbl_mgr' },
    update: { passwordHash: adminHash, role: 'hub_manager', venueId: VENUE_A },
    create: {
      id: MANAGER_ID,
      username: 'hub_tbl_mgr',
      passwordHash: adminHash,
      role: 'hub_manager',
      venueId: VENUE_A,
    },
  });
  await prisma.user.upsert({
    where: { id: CASHIER_A },
    update: { pinHash, role: 'cashier', venueId: VENUE_A, isActive: true },
    create: { id: CASHIER_A, username: 'hub_cash_a', pinHash, role: 'cashier', venueId: VENUE_A },
  });
  await prisma.user.upsert({
    where: { id: CASHIER_B },
    update: { pinHash, role: 'cashier', venueId: VENUE_B, isActive: true },
    create: { id: CASHIER_B, username: 'hub_cash_b', pinHash, role: 'cashier', venueId: VENUE_B },
  });

  await prisma.terminal.upsert({
    where: { id: TERMINAL_A },
    update: { secretHash, venueId: VENUE_A, isActive: true },
    create: { id: TERMINAL_A, name: 'T-A', secretHash, venueId: VENUE_A },
  });
  await prisma.terminal.upsert({
    where: { id: TERMINAL_B },
    update: { secretHash, venueId: VENUE_B, isActive: true },
    create: { id: TERMINAL_B, name: 'T-B', secretHash, venueId: VENUE_B },
  });

  const menuA = await seedPublishedVenueMenu(prisma, VENUE_A, {
    items: [{ nameEn: 'Item A', nameAr: 'صنف', price: 40 }],
  });
  menuItemA = menuA.menuItemId;

  const menuB = await seedPublishedVenueMenu(prisma, VENUE_B, {
    items: [{ nameEn: 'Item B', nameAr: 'صنف', price: 50 }],
  });
  menuItemB = menuB.menuItemId;

  await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${signAccessToken({ sub: MANAGER_ID, role: 'hub_manager', venueId: VENUE_A }) }` },
    payload: { anchorVenueId: VENUE_A, targetVenueId: VENUE_B, enabled: true },
  });

  managerToken = signAccessToken({
    sub: MANAGER_ID,
    role: 'hub_manager',
    venueId: VENUE_A,
  });

  for (const label of ['T-Hub-A', 'T-Hub-B', 'T-Hub-Move-A', 'T-Hub-Move-B', 'T-Hub-X']) {
    await ensureHubTable(label);
  }
});

after(async () => {
  await app.close();
});

test('rejects second venue opening same hub table', async () => {
  const openA = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: headersA,
    payload: { cashierId: CASHIER_A, tableLabel: 'T-Hub-A' },
  });
  assert.equal(openA.statusCode, 200, openA.body);

  const openB = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: headersB,
    payload: { cashierId: CASHIER_B, tableLabel: 'T-Hub-A' },
  });
  assert.equal(openB.statusCode, 400, openB.body);
});

test('cross-sell allows sibling venues on same hub table', async () => {
  const open = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: headersA,
    payload: { cashierId: CASHIER_A, tableLabel: 'T-Hub-B' },
  });
  assert.equal(open.statusCode, 200, open.body);
  const anchorId = open.json().id;

  const add = await app.inject({
    method: 'POST',
    url: `/api/v1/cross-venue/cheques/${anchorId}/items`,
    headers: headersA,
    payload: { cashierId: CASHIER_A, venueId: VENUE_B, menuItemId: menuItemB, quantity: 1 },
  });
  assert.equal(add.statusCode, 200, add.body);

  const sibling = await prisma.cheque.findFirst({
    where: { crossVenueGroupId: add.json().group.groupId, venueId: VENUE_B },
  });
  assert.ok(sibling);
  assert.equal(sibling.floorTableId, open.json().floorTableId);
});

test('moveChequeTable syncs order floorTableId', async () => {
  const fromLabel = `T-Move-${Date.now()}`;
  const toLabel = `T-Move-${Date.now()}-B`;
  await ensureHubTable(fromLabel);
  await ensureHubTable(toLabel);

  const open = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: headersA,
    payload: { cashierId: CASHIER_A, tableLabel: fromLabel },
  });
  assert.equal(open.statusCode, 200, open.body);
  const chequeId = open.json().id;

  const move = await app.inject({
    method: 'PATCH',
    url: `/api/v1/cheques/${chequeId}/table`,
    headers: headersA,
    payload: { targetTableLabel: toLabel },
  });
  assert.equal(move.statusCode, 200, move.body);

  const hubB = await prisma.floorTable.findUnique({ where: { tableLabel: toLabel } });
  const orders = await prisma.order.findMany({
    where: { chequeLink: { chequeId } },
  });
  assert.ok(orders.length > 0);
  assert.ok(orders.every((o) => o.floorTableId === hubB.id && o.tableLabel === toLabel));
});

test('orders list chequeId deep-link ignores tableLabel filter', async () => {
  const open = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: headersA,
    payload: { cashierId: CASHIER_A, tableLabel: 'T-Hub-X' },
  });
  assert.equal(open.statusCode, 200, open.body);
  const chequeId = open.json().id;

  const detail = await app.inject({
    method: 'GET',
    url: `/api/v1/cheques/${chequeId}`,
    headers: headersA,
  });
  assert.equal(detail.statusCode, 200, detail.body);
  const draftId = detail.json().draftOrder?.id;
  assert.ok(draftId);

  const add = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${draftId}/items`,
    headers: headersA,
    payload: { menuItemId: menuItemA, quantity: 1 },
  });
  assert.equal(add.statusCode, 200, add.body);

  const fire = await app.inject({
    method: 'POST',
    url: `/api/v1/cheques/${chequeId}/fire`,
    headers: headersA,
  });
  assert.equal(fire.statusCode, 200, fire.body);

  const list = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/orders?chequeId=${chequeId}&tableLabel=WRONG&venueId=${VENUE_A}&groupBy=shift`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const shifts = list.json().shifts ?? [];
  const found = shifts.flatMap((s) => s.cheques ?? []).some((g) => g.chequeId === chequeId);
  assert.ok(found, 'chequeId filter should return the cheque despite tableLabel mismatch');
});
