import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { validationError } from '../utils/errors.js';
import {
  computeChequeSubtotal,
  findDraftOrder,
  loadCheque,
} from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';

export function resolveDiscountAmount(cheque, { amount, percent }) {
  const subtotal = computeChequeSubtotal(cheque);
  if (subtotal <= 0) throw validationError('Nothing to discount on this cheque');

  let discountAmount = amount != null ? Number(amount) : null;
  const pct = percent != null ? Number(percent) : null;

  if (discountAmount == null && pct == null) {
    throw validationError('Discount amount or percent is required');
  }
  if (discountAmount != null && pct != null) {
    throw validationError('Provide either amount or percent, not both');
  }
  if (pct != null) {
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw validationError('Percent must be between 0 and 100');
    }
    discountAmount = Number(((subtotal * pct) / 100).toFixed(2));
  }

  if (!Number.isFinite(discountAmount) || discountAmount <= 0) {
    throw validationError('Discount must be greater than zero');
  }
  if (discountAmount > subtotal) {
    throw validationError('Discount cannot exceed cheque subtotal');
  }

  return { discountAmount, percent: pct, subtotal };
}

export function assertDiscountAllowed(cheque) {
  if (!config.featureDiscountsEnabled) {
    throw validationError('Discounts are not enabled for this venue');
  }
  if (cheque.status !== 'open') throw validationError('Discounts apply only to open cheques');

  const draft = cheque.parentChequeId ? null : findDraftOrder(cheque);
  if (draft?.items?.length) {
    throw validationError('Send or clear the current round before applying a discount');
  }
}

function assertDiscountPresent(cheque) {
  if (Number(cheque.discountAmount ?? 0) <= 0) {
    throw validationError('No discount on this cheque');
  }
}

function discountAuditData({
  chequeId,
  cashierId,
  initiatorId,
  approverId,
  action,
  amount,
  previousAmount = null,
  percent = null,
  reason,
}) {
  return {
    chequeId,
    cashierId,
    initiatorId,
    approverId,
    action,
    amount,
    previousAmount,
    percent,
    reason: reason.trim(),
  };
}

export async function executeChequeDiscount(
  chequeId,
  {
    amount,
    percent,
    reason,
    initiatorId,
    approverId,
    cashierId,
  },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  assertDiscountAllowed(cheque);
  if (Number(cheque.discountAmount ?? 0) > 0) {
    throw validationError('Discount already applied — edit or remove it first');
  }
  if (!reason?.trim()) throw validationError('Discount reason is required');

  const { discountAmount, percent: pct } = resolveDiscountAmount(cheque, { amount, percent });
  const resolvedCashierId = cashierId ?? cheque.cashierId;

  await prisma.$transaction(async (tx) => {
    await tx.chequeDiscountAudit.create({
      data: discountAuditData({
        chequeId,
        cashierId: resolvedCashierId,
        initiatorId,
        approverId,
        action: 'apply',
        amount: discountAmount,
        percent: pct,
        reason,
      }),
    });
    await tx.cheque.update({
      where: { id: chequeId },
      data: { discountAmount },
    });
  });

  return getCheque(chequeId, venueId);
}

export async function updateChequeDiscount(
  chequeId,
  {
    amount,
    percent,
    reason,
    initiatorId,
    approverId,
    cashierId,
  },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  assertDiscountAllowed(cheque);
  assertDiscountPresent(cheque);
  if (!reason?.trim()) throw validationError('Discount reason is required');

  const previousAmount = Number(cheque.discountAmount);
  const { discountAmount, percent: pct } = resolveDiscountAmount(cheque, { amount, percent });
  const resolvedCashierId = cashierId ?? cheque.cashierId;

  await prisma.$transaction(async (tx) => {
    await tx.chequeDiscountAudit.create({
      data: discountAuditData({
        chequeId,
        cashierId: resolvedCashierId,
        initiatorId,
        approverId,
        action: 'change',
        amount: discountAmount,
        previousAmount,
        percent: pct,
        reason,
      }),
    });
    await tx.cheque.update({
      where: { id: chequeId },
      data: { discountAmount },
    });
  });

  return getCheque(chequeId, venueId);
}

export async function removeChequeDiscount(
  chequeId,
  { reason, initiatorId, approverId, cashierId },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  assertDiscountAllowed(cheque);
  assertDiscountPresent(cheque);
  if (!reason?.trim()) throw validationError('Discount reason is required');

  const removedAmount = Number(cheque.discountAmount);
  const resolvedCashierId = cashierId ?? cheque.cashierId;

  await prisma.$transaction(async (tx) => {
    await tx.chequeDiscountAudit.create({
      data: discountAuditData({
        chequeId,
        cashierId: resolvedCashierId,
        initiatorId,
        approverId,
        action: 'remove',
        amount: removedAmount,
        previousAmount: removedAmount,
        reason,
      }),
    });
    await tx.cheque.update({
      where: { id: chequeId },
      data: { discountAmount: 0 },
    });
  });

  return getCheque(chequeId, venueId);
}

function discountActivityType(action) {
  if (action === 'change') return 'discount_change';
  if (action === 'remove') return 'discount_remove';
  return 'discount';
}

function discountActivityDetail(row) {
  const amount = Number(row.amount);
  const prev = row.previousAmount != null ? Number(row.previousAmount) : null;
  if (row.action === 'change' && prev != null) {
    return `${prev.toFixed(2)} → ${amount.toFixed(2)} EGP`;
  }
  if (row.action === 'remove') {
    return `Removed ${amount.toFixed(2)} EGP`;
  }
  return row.percent ? `${row.percent}%` : null;
}

export async function listDiscountAudits(venueId, { limit = 50 } = {}) {
  const rows = await prisma.chequeDiscountAudit.findMany({
    where: { cheque: { venueId } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      cheque: { select: { chequeNumber: true, tableLabel: true } },
      initiator: { select: { username: true, role: true } },
      approver: { select: { username: true, role: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    chequeId: row.chequeId,
    chequeNumber: row.cheque.chequeNumber,
    tableLabel: row.cheque.tableLabel,
    action: row.action,
    amount: Number(row.amount),
    previousAmount: row.previousAmount != null ? Number(row.previousAmount) : null,
    percent: row.percent != null ? Number(row.percent) : null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    initiator: row.initiator.username,
    approver: row.approver.username,
    activityType: discountActivityType(row.action),
    detail: discountActivityDetail(row),
  }));
}
