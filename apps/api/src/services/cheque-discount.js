import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { validationError } from '../utils/errors.js';
import { verifyDualManagerApproval } from './auth-service.js';
import {
  computeChequeSubtotal,
  findDraftOrder,
  loadCheque,
} from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';

export async function applyChequeDiscount(
  chequeId,
  {
    amount,
    percent,
    reason,
    restaurantManagerPin,
    generalManagerPin,
    cashierId,
  },
  venueId,
) {
  if (!config.featureDiscountsEnabled) {
    throw validationError('Discounts are not enabled for this venue');
  }

  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'open') throw validationError('Discounts apply only to open cheques');

  const draft = cheque.parentChequeId ? null : findDraftOrder(cheque);
  if (draft?.items?.length) {
    throw validationError('Send or clear the current round before applying a discount');
  }

  if (!reason?.trim()) throw validationError('Discount reason is required');

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

  const { initiator, approver } = await verifyDualManagerApproval(venueId, {
    restaurantManagerPin,
    generalManagerPin,
  });

  const resolvedCashierId = cashierId ?? cheque.cashierId;

  await prisma.$transaction([
    prisma.chequeDiscountAudit.create({
      data: {
        chequeId,
        cashierId: resolvedCashierId,
        initiatorId: initiator.id,
        approverId: approver.id,
        amount: discountAmount,
        percent: pct,
        reason: reason.trim(),
      },
    }),
    prisma.cheque.update({
      where: { id: chequeId },
      data: { discountAmount },
    }),
  ]);

  return getCheque(chequeId, venueId);
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
    amount: Number(row.amount),
    percent: row.percent != null ? Number(row.percent) : null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    initiator: row.initiator.username,
    approver: row.approver.username,
  }));
}
