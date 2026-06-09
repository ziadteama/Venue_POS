import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import {
  createVenueUser,
  resetVenueUserPin,
} from './services/manager-user-service.js';

const VENUE_A = '00000000-0000-4000-8000-000000000098';
const VENUE_B = '00000000-0000-4000-8000-000000000099';
let actor;
let existingUserId;

before(async () => {
  await prisma.venue.upsert({
    where: { id: VENUE_A },
    update: {},
    create: { id: VENUE_A, nameEn: 'PIN Test A', nameAr: 'أ', type: 'standard' },
  });
  await prisma.venue.upsert({
    where: { id: VENUE_B },
    update: {},
    create: { id: VENUE_B, nameEn: 'PIN Test B', nameAr: 'ب', type: 'standard' },
  });

  const actorPinHash = await bcrypt.hash('9901', config.bcryptRounds);
  actor = await prisma.user.upsert({
    where: { username: 'pin_test_actor' },
    update: { pinHash: actorPinHash, role: 'hub_manager', venueId: VENUE_A, isActive: true },
    create: {
      username: 'pin_test_actor',
      pinHash: actorPinHash,
      role: 'hub_manager',
      venueId: VENUE_A,
    },
  });

  const pinHash = await bcrypt.hash('5608', config.bcryptRounds);
  const existing = await prisma.user.upsert({
    where: { username: 'pin_test_existing' },
    update: { pinHash, role: 'cashier', venueId: VENUE_A, isActive: true },
    create: {
      username: 'pin_test_existing',
      pinHash,
      role: 'cashier',
      venueId: VENUE_A,
    },
  });
  existingUserId = existing.id;
});

after(async () => {
  await prisma.user.deleteMany({
    where: {
      username: {
        in: ['pin_test_actor', 'pin_test_existing', 'pin_test_new', 'pin_test_cross', 'pin_test_other'],
      },
    },
  });
});

test('rejects duplicate PIN within the same venue', async () => {
  await assert.rejects(
    () =>
      createVenueUser(actor, VENUE_A, {
        username: 'pin_test_new',
        role: 'cashier',
        pin: '5608',
      }),
    /already assigned/i,
  );
});

test('rejects duplicate PIN across different venues', async () => {
  await assert.rejects(
    () =>
      createVenueUser(actor, VENUE_B, {
        username: 'pin_test_cross',
        role: 'cashier',
        pin: '5608',
      }),
    /already assigned/i,
  );
});

test('allows PIN reset to the same value for the same user', async () => {
  const result = await resetVenueUserPin(actor, existingUserId, VENUE_A, '5608');
  assert.equal(result.ok, true);
});

test('rejects PIN reset when another user already has that PIN', async () => {
  const otherPinHash = await bcrypt.hash('5609', config.bcryptRounds);
  const other = await prisma.user.create({
    data: {
      username: 'pin_test_other',
      pinHash: otherPinHash,
      role: 'cashier',
      venueId: VENUE_B,
    },
  });
  try {
    await assert.rejects(
      () => resetVenueUserPin(actor, existingUserId, VENUE_A, '5609'),
      /already assigned/i,
    );
  } finally {
    await prisma.user.delete({ where: { id: other.id } });
  }
});
