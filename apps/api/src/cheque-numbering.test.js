import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys, signAccessToken } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';
import { publishMenuTemplate } from './services/menu-service.js';

const VENUE_A = '00000000-0000-4000-8000-0000000000b1';
const VENUE_B = '00000000-0000-4000-8000-0000000000b2';
const TERMINAL_A = '00000000-0000-4000-8000-0000000000b3';
const CASHIER_A = '00000000-0000-4000-8000-0000000000b5';
const SECRET = 'numbering-test-secret';

const headersA = { 'x-terminal-id': TERMINAL_A, 'x-terminal-secret': SECRET };

let app;
let managerToken;
let anchorMenuItemId;
let targetMenuItemId;

async function seedMenu(venueId, nameEn) {
  const template = await prisma.menuTemplate.create({
    data: {
      nameEn: `${nameEn} menu`,
      nameAr: 'قائمة',
      venues: { create: [{ venueId }] },
      categories: {
        create: [
          {
            nameEn: 'All',
            nameAr: 'الكل',
            sortOrder: 0,
            items: { create: [{ nameEn: 'Item', nameAr: 'صنف', price: 10, sortOrder: 0 }] },
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
    create: { id: VENUE_A, nameEn: 'Cafe N', nameAr: 'كافيه', type: 'anchor' },
  });
  await prisma.venue.upsert({
    where: { id: VENUE_B },
    update: { type: 'standard', isActive: true },
    create: { id: VENUE_B, nameEn: 'Rest N', nameAr: 'مطعم', type: 'standard' },
  });
  await prisma.user.upsert({
    where: { username: 'cashier_num' },
    update: { pinHash, role: 'cashier', venueId: VENUE_A, isActive: true },
    create: {
      id: CASHIER_A,
      username: 'cashier_num',
      passwordHash: adminHash,
      pinHash,
      role: 'cashier',
      venueId: VENUE_A,
    },
  });
  await prisma.user.upsert({
    where: { username: 'num_mgr' },
    update: { passwordHash: adminHash, role: 'hub_manager', venueId: VENUE_A },
    create: {
      id: '00000000-0000-4000-8000-0000000000b7',
      username: 'num_mgr',
      passwordHash: adminHash,
      role: 'hub_manager',
      venueId: VENUE_A,
    },
  });
  await prisma.terminal.upsert({
    where: { id: TERMINAL_A },
    update: { secretHash, venueId: VENUE_A, isActive: true },
    create: { id: TERMINAL_A, venueId: VENUE_A, name: 'Till N', secretHash },
  });

  anchorMenuItemId = await seedMenu(VENUE_A, 'Cafe');
  targetMenuItemId = await seedMenu(VENUE_B, 'Rest');

  const mgr = await prisma.user.findUnique({ where: { username: 'num_mgr' } });
  managerToken = signAccessToken({ sub: mgr.id, role: 'hub_manager', venue_id: VENUE_A });

  await app.inject({
    method: 'PUT',
    url: '/api/v1/manager/billing-config',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { anchorVenueId: VENUE_A, targetVenueId: VENUE_B, enabled: true },
  });
  await app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: headersA,
    payload: { cashierId: CASHIER_A, openFloat: 100 },
  });
});

after(async () => {
  await app.close();
});

test('hub-wide cheque numbers are monotonic across venues', async () => {
  const openA = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: headersA,
    payload: { cashierId: CASHIER_A, tableLabel: 'T-hub-1' },
  });
  assert.equal(openA.statusCode, 200, openA.body);
  const numA = openA.json().chequeNumber;

  const openB = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: headersA,
    payload: { cashierId: CASHIER_A, tableLabel: 'T-hub-2' },
  });
  assert.equal(openB.statusCode, 200, openB.body);
  const numB = openB.json().chequeNumber;
  assert.ok(numB > numA);
});

test('cross-sell sibling cheques share anchor cheque number', async () => {
  const open = await app.inject({
    method: 'POST',
    url: '/api/v1/cheques/open',
    headers: headersA,
    payload: { cashierId: CASHIER_A, tableLabel: 'T-cross-num' },
  });
  assert.equal(open.statusCode, 200, open.body);
  const anchor = open.json();

  const addAnchor = await app.inject({
    method: 'POST',
    url: `/api/v1/cross-venue/cheques/${anchor.id}/items`,
    headers: headersA,
    payload: {
      cashierId: CASHIER_A,
      venueId: VENUE_A,
      menuItemId: anchorMenuItemId,
      quantity: 1,
    },
  });
  assert.equal(addAnchor.statusCode, 200, addAnchor.body);

  const addTarget = await app.inject({
    method: 'POST',
    url: `/api/v1/cross-venue/cheques/${anchor.id}/items`,
    headers: headersA,
    payload: {
      cashierId: CASHIER_A,
      venueId: VENUE_B,
      menuItemId: targetMenuItemId,
      quantity: 1,
    },
  });
  assert.equal(addTarget.statusCode, 200, addTarget.body);
  const groupId = addTarget.json().group.groupId;

  const members = await prisma.cheque.findMany({ where: { crossVenueGroupId: groupId } });
  assert.equal(members.length, 2);
  assert.ok(members.every((m) => m.chequeNumber === anchor.chequeNumber));
});

test('manager cross-venue list and cheque search', async () => {
  const groups = await app.inject({
    method: 'GET',
    url: '/api/v1/manager/cheques/cross-venue?status=open',
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(groups.statusCode, 200);
  assert.ok(Array.isArray(groups.json()));
  assert.ok(groups.json().length >= 1);
  assert.ok(groups.json()[0].members?.length >= 2);

  const search = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/cheques?status=open&venueId=${VENUE_A}&q=T-cross`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(search.statusCode, 200);
  assert.ok(search.json().some((c) => c.tableLabel?.includes('T-cross')));

  const crossRow = await prisma.cheque.findFirst({
    where: { tableLabel: 'T-cross-num', venueId: VENUE_A },
    select: { chequeNumber: true },
  });
  assert.ok(crossRow, 'cross-sell anchor from prior test');
  const hubSearch = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/cheques/hub-search?status=open&q=${crossRow.chequeNumber}`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(hubSearch.statusCode, 200);
  const hubHits = hubSearch.json();
  const venueIds = new Set(hubHits.map((c) => c.venueId));
  assert.ok(hubHits.length >= 2, 'shared cheque number should match both venues');
  assert.ok(hubHits.every((c) => c.chequeNumber === crossRow.chequeNumber));
  assert.ok(venueIds.has(VENUE_A));
  assert.ok(venueIds.has(VENUE_B));
});
