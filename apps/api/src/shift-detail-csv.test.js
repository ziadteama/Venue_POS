import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys } from './utils/jwt.js';
import { hashSecret } from './services/auth-service.js';
import bcrypt from 'bcrypt';
import { appendAuditLog, listFullAuditLog } from './services/audit-log-service.js';
import {
  shiftDetailToCsv,
  shiftsListToCsv,
} from './services/manager-shift-service.js';

const VENUE_ID = '00000000-0000-4000-8000-0000000000e1';
const TERMINAL_ID = '00000000-0000-4000-8000-0000000000e2';

let app;
let managerToken;
let cashierId;

before(async () => {
  ensureKeys();
  app = await buildApp();
  await app.ready();

  const hubPassword = await bcrypt.hash('shiftdetail123', config.bcryptRounds);
  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: {
      id: VENUE_ID,
      nameEn: 'Shift Detail CSV',
      nameAr: 'تفاصيل',
      type: 'standard',
    },
  });

  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  const cashier = await prisma.user.upsert({
    where: { username: 'shift_csv_cashier' },
    update: { pinHash, role: 'cashier', venueId: VENUE_ID, isActive: true },
    create: {
      id: randomUUID(),
      username: 'shift_csv_cashier',
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
    },
  });
  cashierId = cashier.id;

  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    update: { venueId: VENUE_ID, secretHash: await hashSecret('shift-csv-secret') },
    create: {
      id: TERMINAL_ID,
      venueId: VENUE_ID,
      name: 'ShiftCsv-POS',
      secretHash: await hashSecret('shift-csv-secret'),
    },
  });

  await prisma.user.upsert({
    where: { username: 'shift_csv_hub' },
    update: {
      passwordHash: hubPassword,
      role: 'hub_manager',
      venueId: VENUE_ID,
      isActive: true,
    },
    create: {
      id: randomUUID(),
      username: 'shift_csv_hub',
      passwordHash: hubPassword,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'shift_csv_hub', password: 'shiftdetail123' },
  });
  assert.equal(login.statusCode, 200);
  managerToken = login.json().accessToken;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { venueId: VENUE_ID } });
  await app.close();
  await prisma.$disconnect();
});

test('shiftDetailToCsv includes summary and itemized sections', () => {
  const csv = shiftDetailToCsv({
    venueNameEn: 'Cafe',
    cashierUsername: 'cashier1',
    terminalName: 'Till 1',
    status: 'closed',
    openFloat: 100,
    closeFloat: 250,
    expectedCash: 240,
    overShortAmount: 10,
    totalRevenue: 140,
    totalRefunds: 20,
    discountTotal: 5,
    discountCount: 1,
    paymentCount: 2,
    refundCount: 1,
    voidCount: 1,
    compCount: 0,
    paymentsByMethod: { cash: 100, card: 60, voucher: 0 },
    refundsByMethod: { cash: 20, card: 0, voucher: 0 },
    openedAt: '2026-06-11T08:00:00.000Z',
    closedAt: '2026-06-11T16:00:00.000Z',
    payments: [
      {
        chequeNumber: 42,
        tableLabel: 'T1',
        method: 'cash',
        amount: 100,
        processedAt: '2026-06-11T10:00:00.000Z',
      },
    ],
    refunds: [],
    discounts: [],
    voids: [],
    comps: [],
  });

  assert.match(csv, /SHIFT SUMMARY/);
  assert.match(csv, /over_short,10/);
  assert.match(csv, /PAYMENTS/);
  assert.match(csv, /42,T1,cash,100/);
});

test('shiftsListToCsv includes method breakdown and venue footer', () => {
  const csv = shiftsListToCsv({
    shifts: [
      {
        venueId: 'v1',
        venueNameEn: 'Cafe',
        cashierUsername: 'a',
        terminalName: 'T1',
        status: 'closed',
        openFloat: 100,
        expectedCash: 200,
        closeFloat: 200,
        overShortAmount: 0,
        totalRevenue: 100,
        totalRefunds: 0,
        paymentsByMethod: { cash: 100, card: 0, voucher: 0 },
        refundsByMethod: { cash: 0, card: 0, voucher: 0 },
        discountTotal: 0,
        discountCount: 0,
        paymentCount: 1,
        refundCount: 0,
        voidCount: 0,
        compCount: 0,
        openedAt: '2026-06-11T08:00:00.000Z',
        closedAt: '2026-06-11T16:00:00.000Z',
      },
      {
        venueId: 'v2',
        venueNameEn: 'Restaurant',
        cashierUsername: 'b',
        terminalName: 'T2',
        status: 'closed',
        openFloat: 50,
        expectedCash: 150,
        closeFloat: 150,
        overShortAmount: 0,
        totalRevenue: 100,
        totalRefunds: 0,
        paymentsByMethod: { cash: 0, card: 100, voucher: 0 },
        refundsByMethod: { cash: 0, card: 0, voucher: 0 },
        discountTotal: 0,
        discountCount: 0,
        paymentCount: 1,
        refundCount: 0,
        voidCount: 0,
        compCount: 0,
        openedAt: '2026-06-11T09:00:00.000Z',
        closedAt: '2026-06-11T17:00:00.000Z',
      },
    ],
  });

  assert.match(csv, /cash_payments/);
  assert.match(csv, /void_count/);
  assert.match(csv, /VENUE TOTALS/);
  assert.match(csv, /Cafe,1/);
  assert.match(csv, /Restaurant,1/);
});

test('needs_review audit filter returns only review-relevant types', async () => {
  await prisma.auditLog.deleteMany({ where: { venueId: VENUE_ID } });

  await appendAuditLog({
    venueId: VENUE_ID,
    actorUsername: 'admin',
    action: 'menu.publish',
    summary: 'Menu published',
  });
  await appendAuditLog({
    venueId: VENUE_ID,
    actorUsername: 'admin',
    action: 'user.pin_reset',
    summary: 'PIN reset for cashier1',
  });
  await appendAuditLog({
    venueId: VENUE_ID,
    actorUsername: 'admin',
    action: 'check.reprint',
    summary: 'Check reprinted',
    details: { chequeNumber: 9, reason: 'Guest request' },
  });

  const review = await listFullAuditLog(VENUE_ID, { type: 'needs_review', limit: 100 });
  const types = new Set(review.events.map((ev) => ev.type));

  assert.equal(types.has('menu'), false);
  assert.equal(types.has('user'), true);
  assert.equal(types.has('check_reprint'), true);
});

test('GET shift detail CSV is allowed for hub manager', async () => {
  const shift = await prisma.shift.create({
    data: {
      venueId: VENUE_ID,
      terminalId: TERMINAL_ID,
      cashierId,
      status: 'closed',
      openFloat: 100,
      closeFloat: 100,
      expectedCash: 100,
      overShortAmount: 0,
      openedAt: new Date(),
      closedAt: new Date(),
    },
  });

  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/manager/shifts/${shift.id}?venueId=${VENUE_ID}&format=csv`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /SHIFT SUMMARY/);

  await prisma.shift.delete({ where: { id: shift.id } });
});
