import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from '../app.js';
import { prisma as prismaClient } from '../db/prisma.js';

export const prisma = prismaClient;
import { config } from '../config.js';
import { ensureKeys, signAccessToken } from '../utils/jwt.js';
import { hashSecret } from '../services/auth-service.js';
import { resetHubBilling } from '../test-helpers/reset-hub-billing.js';

export const VENUE_ID = '00000000-0000-4000-8000-000000000095';
export const TERMINAL_ID = '00000000-0000-4000-8000-000000000095';
export const TERMINAL_SECRET = 'phase1-test-secret';
export const CASHIER_ID = '00000000-0000-4000-8000-000000000094';

/** Shared mutable state across phase1 modules (menu ids, tokens, app). */
export const fx = {
  app: null,
  managerToken: null,
  ownerToken: null,
  venueManagerToken: null,
  templateId: null,
  categoryId: null,
  menuItemId: null,
  orderId: null,
};

export const terminalHeaders = {
  'x-terminal-id': TERMINAL_ID,
  'x-terminal-secret': TERMINAL_SECRET,
};

export async function clearOpenCheques() {
  await prisma.cheque.updateMany({
    where: { venueId: VENUE_ID, cashierId: CASHIER_ID, status: 'open' },
    data: { status: 'voided', closedAt: new Date() },
  });
}

async function seedPhase1Menu() {
  const catRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/categories`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: { nameEn: 'Phase1 Mains', nameAr: 'أطباق', sortOrder: 0 },
  });
  assert.equal(catRes.statusCode, 200);
  fx.categoryId = catRes.json().categories.at(-1)?.id;
  assert.ok(fx.categoryId, 'category id from create response');

  const itemRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/categories/${fx.categoryId}/items`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: { nameEn: 'Phase1 Burger', nameAr: 'برجر', price: 120 },
  });
  assert.equal(itemRes.statusCode, 200);
  const category = itemRes.json().categories.find((c) => c.id === fx.categoryId);
  fx.menuItemId = category?.items?.at(-1)?.id;
  assert.ok(fx.menuItemId, 'menu item id from create response');

  await fx.app.inject({
    method: 'POST',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/modifier-groups`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
    payload: {
      nameEn: 'Phase1 Size',
      nameAr: 'حجم',
      minSelection: 1,
      maxSelection: 1,
      menuItemIds: [fx.menuItemId],
      options: [
        { nameEn: 'Large', nameAr: 'كبير', priceDelta: 15 },
        { nameEn: 'Regular', nameAr: 'عادي', priceDelta: 0 },
      ],
    },
  });

  const publishRes = await fx.app.inject({
    method: 'POST',
    url: `/api/v1/manager/venues/${VENUE_ID}/menu/publish`,
    headers: { authorization: `Bearer ${fx.managerToken}` },
  });
  assert.equal(publishRes.statusCode, 200);
}

export async function getPhase1Modifier() {
  const menuRes = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/venues/${VENUE_ID}/menu`,
    headers: terminalHeaders,
  });
  assert.equal(menuRes.statusCode, 200);
  const item = menuRes.json().categories
    .flatMap((c) => c.items)
    .find((i) => i.id === fx.menuItemId);
  assert.ok(item?.modifierGroups?.length >= 1, 'Phase1 menu item with modifiers');
  const group = item.modifierGroups[0];
  return { group, option: group.options[0] };
}

export async function ensureOpenShift(openFloat = 500) {
  const active = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/shifts/active?cashierId=${CASHIER_ID}`,
    headers: terminalHeaders,
  });
  if (active.json()?.id) return active.json();

  const res = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/shifts/open',
    headers: terminalHeaders,
    payload: { cashierId: CASHIER_ID, openFloat },
  });
  assert.equal(res.statusCode, 200);
  return res.json();
}

before(async () => {
  ensureKeys();
  await resetHubBilling();
  fx.app = await buildApp();
  fx.app.io = { to: () => ({ emit: () => {} }) };
  await fx.app.ready();

  const passwordHash = await bcrypt.hash('phase1admin', config.bcryptRounds);
  const pinHash = await bcrypt.hash('5555', config.bcryptRounds);
  const managerPinHash = await bcrypt.hash('8888', config.bcryptRounds);

  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: { serviceEnabled: false, serviceRate: 0 },
    create: {
      id: VENUE_ID,
      nameEn: 'Phase1 Venue',
      nameAr: 'اختبار',
      type: 'standard',
      serviceEnabled: false,
      serviceRate: 0,
    },
  });

  await prisma.user.upsert({
    where: { username: 'phase1admin' },
    update: {
      passwordHash,
      pinHash: managerPinHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
    create: {
      username: 'phase1admin',
      passwordHash,
      pinHash: managerPinHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });

  await prisma.user.upsert({
    where: { id: CASHIER_ID },
    update: { pinHash, role: 'cashier', venueId: VENUE_ID, username: 'phase1cashier' },
    create: {
      id: CASHIER_ID,
      username: 'phase1cashier',
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
    },
  });

  const venueManagerPinHash = await bcrypt.hash('7777', config.bcryptRounds);
  const venuePasswordHash = await bcrypt.hash('venue123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'phase1venue' },
    update: {
      pinHash: venueManagerPinHash,
      passwordHash: venuePasswordHash,
      role: 'venue_manager',
      venueId: VENUE_ID,
      isActive: true,
    },
    create: {
      username: 'phase1venue',
      pinHash: venueManagerPinHash,
      passwordHash: venuePasswordHash,
      role: 'venue_manager',
      venueId: VENUE_ID,
    },
  });

  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    update: { secretHash: await hashSecret(TERMINAL_SECRET), venueId: VENUE_ID },
    create: {
      id: TERMINAL_ID,
      venueId: VENUE_ID,
      name: 'P1-POS',
      secretHash: await hashSecret(TERMINAL_SECRET),
    },
  });

  const ownerPasswordHash = await bcrypt.hash('owner123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'owner' },
    update: {
      passwordHash: ownerPasswordHash,
      role: 'hub_owner',
      venueId: VENUE_ID,
    },
    create: {
      username: 'owner',
      passwordHash: ownerPasswordHash,
      role: 'hub_owner',
      venueId: VENUE_ID,
    },
  });

  const login = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'phase1admin', password: 'phase1admin' },
  });
  fx.managerToken = login.json().accessToken;

  const ownerLogin = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'owner', password: 'owner123' },
  });
  assert.equal(ownerLogin.statusCode, 200);
  fx.ownerToken = ownerLogin.json().accessToken;

  const venueLogin = await fx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'phase1venue', password: 'venue123' },
  });
  assert.equal(venueLogin.statusCode, 401);

  const venueUser = await prisma.user.findUnique({ where: { username: 'phase1venue' } });
  fx.venueManagerToken = signAccessToken({
    sub: venueUser.id,
    role: 'venue_manager',
    venue_id: VENUE_ID,
  });

  await seedPhase1Menu();
});

after(async () => {
  await fx.app.close();
  await prisma.$disconnect();
});
