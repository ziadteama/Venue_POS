import { prisma } from '../db/prisma.js';
import { validationError, notFound } from '../utils/errors.js';
import { verifyManagerPin } from './auth-service.js';

export const OVER_SHORT_THRESHOLD = 50;

export const shiftRelationsInclude = {
  payments: { include: { cheque: { select: { discountAmount: true } } } },
  refunds: true,
};

export function discountStatsFromPayments(payments) {
  let discountCount = 0;
  let discountTotal = 0;
  for (const p of payments) {
    const amt = Number(p.cheque?.discountAmount ?? 0);
    if (amt > 0) {
      discountCount += 1;
      discountTotal += amt;
    }
  }
  return {
    discountCount,
    discountTotal: Number(discountTotal.toFixed(2)),
  };
}

export function serializeShift(shift) {
  return {
    id: shift.id,
    venueId: shift.venueId,
    terminalId: shift.terminalId,
    cashierId: shift.cashierId,
    status: shift.status,
    openFloat: Number(shift.openFloat),
    closeFloat: shift.closeFloat != null ? Number(shift.closeFloat) : null,
    expectedCash: shift.expectedCash != null ? Number(shift.expectedCash) : null,
    overShortAmount: shift.overShortAmount != null ? Number(shift.overShortAmount) : null,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
  };
}

function paymentTotals(payments, refunds = []) {
  const byMethod = { cash: 0, card: 0, voucher: 0 };
  let total = 0;
  for (const p of payments) {
    const amt = Number(p.amount);
    total += amt;
    byMethod[p.method] = (byMethod[p.method] ?? 0) + amt;
  }

  const refundsByMethod = { cash: 0, card: 0, voucher: 0 };
  let refundTotal = 0;
  for (const r of refunds) {
    const amt = Number(r.amount);
    refundTotal += amt;
    refundsByMethod[r.method] = (refundsByMethod[r.method] ?? 0) + amt;
    total -= amt;
  }

  return {
    total,
    byMethod,
    count: payments.length,
    refundTotal,
    refundsByMethod,
    refundCount: refunds.length,
  };
}

export function buildShiftReport(shift, payments, refunds = []) {
  const { total, byMethod, count, refundTotal, refundsByMethod, refundCount } = paymentTotals(
    payments,
    refunds,
  );
  const { discountCount, discountTotal } = discountStatsFromPayments(payments);
  const openFloat = Number(shift.openFloat);
  const cashIn = (byMethod.cash ?? 0) - (refundsByMethod.cash ?? 0);
  const expectedCash = Number((openFloat + cashIn).toFixed(2));

  return {
    shift: serializeShift(shift),
    paymentCount: count,
    refundCount,
    discountCount,
    discountTotal,
    totalRevenue: Number(total.toFixed(2)),
    totalRefunds: Number(refundTotal.toFixed(2)),
    paymentsByMethod: {
      cash: Number((byMethod.cash ?? 0).toFixed(2)),
      card: Number((byMethod.card ?? 0).toFixed(2)),
      voucher: Number((byMethod.voucher ?? 0).toFixed(2)),
    },
    refundsByMethod: {
      cash: Number((refundsByMethod.cash ?? 0).toFixed(2)),
      card: Number((refundsByMethod.card ?? 0).toFixed(2)),
      voucher: Number((refundsByMethod.voucher ?? 0).toFixed(2)),
    },
    expectedCash,
  };
}

export async function getActiveShift(cashierId, terminalId, venueId) {
  const shift = await prisma.shift.findFirst({
    where: {
      cashierId,
      terminalId,
      venueId,
      status: 'open',
    },
    include: shiftRelationsInclude,
  });
  if (!shift) return null;
  return {
    ...serializeShift(shift),
    report: buildShiftReport(shift, shift.payments, shift.refunds),
  };
}

export async function requireActiveShift(cashierId, terminalId, venueId) {
  const shift = await prisma.shift.findFirst({
    where: { cashierId, terminalId, venueId, status: 'open' },
  });
  if (!shift) {
    throw validationError('Open a shift before taking payments');
  }
  return shift;
}

export async function countOpenChequesForCashier(venueId, cashierId, terminalId) {
  return prisma.cheque.count({
    where: { venueId, cashierId, terminalId, status: 'open' },
  });
}

export async function openShift({ cashierId, terminalId, venueId, openFloat }) {
  const float = Number(openFloat);
  if (!Number.isFinite(float) || float < 0) {
    throw validationError('Opening float must be zero or greater');
  }

  const cashier = await prisma.user.findUnique({ where: { id: cashierId } });
  if (!cashier?.isActive || cashier.role !== 'cashier') {
    throw validationError('Invalid cashier');
  }
  if (cashier.venueId !== venueId) {
    throw validationError('Cashier does not belong to this venue');
  }

  const existing = await prisma.shift.findFirst({
    where: { cashierId, status: 'open' },
    include: shiftRelationsInclude,
  });
  if (existing) {
    if (existing.terminalId !== terminalId) {
      throw validationError(
        'This cashier already has an open shift on another terminal. Close it there first or ask a manager.',
      );
    }
    return {
      ...serializeShift(existing),
      resumed: true,
      openChequeCount: await countOpenChequesForCashier(venueId, cashierId, terminalId),
      report: buildShiftReport(existing, existing.payments, existing.refunds),
    };
  }

  const openChequeCount = await countOpenChequesForCashier(venueId, cashierId, terminalId);

  const shift = await prisma.$transaction(async (tx) => {
    const created = await tx.shift.create({
      data: {
        venueId,
        terminalId,
        cashierId,
        openFloat: float,
      },
    });
    await tx.shiftEvent.create({
      data: {
        shiftId: created.id,
        action: 'open',
        userId: cashierId,
        details: { openFloat: float, terminalId },
      },
    });
    return created;
  });

  return {
    ...serializeShift(shift),
    resumed: false,
    openChequeCount,
    report: buildShiftReport(shift, [], []),
  };
}

export async function closeShift(
  { cashierId, terminalId, venueId, closeFloat, managerPin },
  { overShortThreshold = OVER_SHORT_THRESHOLD } = {},
) {
  const counted = Number(closeFloat);
  if (!Number.isFinite(counted) || counted < 0) {
    throw validationError('Close float must be zero or greater');
  }

  const shift = await prisma.shift.findFirst({
    where: { cashierId, terminalId, venueId, status: 'open' },
    include: shiftRelationsInclude,
  });
  if (!shift) throw validationError('No open shift for this cashier');

  const openChequeCount = await countOpenChequesForCashier(venueId, cashierId, terminalId);
  if (openChequeCount > 0) {
    throw validationError(
      `Close ${openChequeCount} open table${openChequeCount === 1 ? '' : 's'} before closing the shift`,
    );
  }

  const report = buildShiftReport(shift, shift.payments, shift.refunds);
  const overShort = Number((counted - report.expectedCash).toFixed(2));

  if (Math.abs(overShort) > overShortThreshold) {
    if (!managerPin) {
      throw validationError('Manager approval required for over/short above threshold');
    }
    await verifyManagerPin(venueId, managerPin);
  }

  const closed = await prisma.$transaction(async (tx) => {
    const updated = await tx.shift.update({
      where: { id: shift.id },
      data: {
        status: 'closed',
        closeFloat: counted,
        expectedCash: report.expectedCash,
        overShortAmount: overShort,
        closedAt: new Date(),
      },
    });
    await tx.shiftEvent.create({
      data: {
        shiftId: shift.id,
        action: 'close',
        userId: cashierId,
        details: {
          closeFloat: counted,
          expectedCash: report.expectedCash,
          overShortAmount: overShort,
          report,
        },
      },
    });
    return updated;
  });

  return {
    shift: serializeShift(closed),
    report: {
      ...report,
      closeFloat: counted,
      overShortAmount: overShort,
    },
  };
}

export async function forceCloseShiftById(
  shiftId,
  { closeFloat, managerPin },
  venueScopeId,
) {
  const counted = Number(closeFloat);
  if (!Number.isFinite(counted) || counted < 0) {
    throw validationError('Close float must be zero or greater');
  }
  if (!managerPin) {
    throw validationError('Manager PIN is required to force-close a shift');
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: shiftRelationsInclude,
  });
  if (!shift) throw notFound('Shift not found');
  if (venueScopeId && shift.venueId !== venueScopeId) throw notFound('Shift not found');
  if (shift.status !== 'open') throw validationError('Shift is already closed');

  await verifyManagerPin(shift.venueId, managerPin);

  const report = buildShiftReport(shift, shift.payments, shift.refunds);
  const overShort = Number((counted - report.expectedCash).toFixed(2));

  const closed = await prisma.$transaction(async (tx) => {
    const updated = await tx.shift.update({
      where: { id: shift.id },
      data: {
        status: 'closed',
        closeFloat: counted,
        expectedCash: report.expectedCash,
        overShortAmount: overShort,
        closedAt: new Date(),
      },
    });
    await tx.shiftEvent.create({
      data: {
        shiftId: shift.id,
        action: 'close',
        userId: shift.cashierId,
        details: {
          closeFloat: counted,
          expectedCash: report.expectedCash,
          overShortAmount: overShort,
          forcedByManager: true,
          report,
        },
      },
    });
    return updated;
  });

  return {
    shift: serializeShift(closed),
    report: {
      ...report,
      closeFloat: counted,
      overShortAmount: overShort,
    },
  };
}
