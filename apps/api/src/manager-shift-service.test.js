import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { getEodReconciliation, listManagerShifts } from './services/manager-shift-service.js';
import { hashSecret } from './services/auth-service.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000097';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000097';

let cashierId;
let overnightShiftId;

before(async () => {
  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: { id: VENUE_ID, nameEn: 'Shift Day Test', nameAr: 'اختبار اليوم', type: 'standard' },
  });

  const pinHash = await bcrypt.hash('5555', config.bcryptRounds);
  const cashier = await prisma.user.upsert({
    where: { username: 'shift_day_cashier' },
    update: { pinHash, role: 'cashier', venueId: VENUE_ID, isActive: true },
    create: {
      username: 'shift_day_cashier',
      pinHash,
      role: 'cashier',
      venueId: VENUE_ID,
    },
  });
  cashierId = cashier.id;

  await prisma.terminal.upsert({
    where: { id: TERMINAL_ID },
    update: { secretHash: await hashSecret('shift-day-secret'), venueId: VENUE_ID, name: 'ShiftDay-POS' },
    create: {
      id: TERMINAL_ID,
      venueId: VENUE_ID,
      name: 'ShiftDay-POS',
      secretHash: await hashSecret('shift-day-secret'),
    },
  });

  const openedAt = new Date(2030, 0, 15, 22, 30, 0);
  const closedAt = new Date(2030, 0, 16, 3, 15, 0);
  const shift = await prisma.shift.create({
    data: {
      venueId: VENUE_ID,
      terminalId: TERMINAL_ID,
      cashierId,
      status: 'closed',
      openFloat: 500,
      closeFloat: 500,
      expectedCash: 500,
      overShortAmount: 0,
      openedAt,
      closedAt,
    },
  });
  overnightShiftId = shift.id;
});

after(async () => {
  await prisma.shift.deleteMany({ where: { id: overnightShiftId } });
  await prisma.$disconnect();
});

test('EOD groups shifts by open day, not close day', async () => {
  const openDay = await getEodReconciliation({ venueId: VENUE_ID, date: '2030-01-15' });
  const closeDay = await getEodReconciliation({ venueId: VENUE_ID, date: '2030-01-16' });

  assert.ok(openDay.shifts.some((s) => s.id === overnightShiftId));
  assert.equal(
    closeDay.shifts.some((s) => s.id === overnightShiftId),
    false,
  );
});

test('shift list date filters use openedAt only', async () => {
  const onOpenDay = await listManagerShifts({
    venueId: VENUE_ID,
    from: '2030-01-15',
    to: '2030-01-15',
  });
  const onCloseDay = await listManagerShifts({
    venueId: VENUE_ID,
    from: '2030-01-16',
    to: '2030-01-16',
  });

  assert.ok(onOpenDay.shifts.some((s) => s.id === overnightShiftId));
  assert.equal(
    onCloseDay.shifts.some((s) => s.id === overnightShiftId),
    false,
  );
});
