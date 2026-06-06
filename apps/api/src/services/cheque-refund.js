import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { validationError } from '../utils/errors.js';
import { buildRefundReceiptText } from '../utils/serialize.js';
import { verifyDualManagerApproval } from './auth-service.js';
import { loadCheque, serializeCheque } from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';
import { requireActiveShift } from './shift-service.js';

function paymentTotalsByMethod(payments) {
  const byMethod = { cash: 0, card: 0, voucher: 0 };
  for (const p of payments) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
  }
  return byMethod;
}

function refundTotalsByMethod(refunds) {
  const byMethod = { cash: 0, card: 0, voucher: 0 };
  for (const r of refunds) {
    byMethod[r.method] = (byMethod[r.method] ?? 0) + Number(r.amount);
  }
  return byMethod;
}

export async function processRefund(
  chequeId,
  {
    amount,
    method,
    reason,
    restaurantManagerPin,
    generalManagerPin,
    cashierId,
    terminalId,
  },
  venueId,
) {
  if (!config.featureRefundsEnabled) {
    throw validationError('Refunds are not enabled for this venue');
  }

  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'paid') throw validationError('Refunds apply only to paid cheques');
  if (!reason?.trim()) throw validationError('Refund reason is required');

  const refundAmount = Number(amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw validationError('Refund amount must be greater than zero');
  }

  const refundMethod = method ?? 'cash';
  if (!['cash', 'card', 'voucher'].includes(refundMethod)) {
    throw validationError('Invalid refund method');
  }

  const paidByMethod = paymentTotalsByMethod(cheque.payments);
  const refundedByMethod = refundTotalsByMethod(cheque.refunds ?? []);

  if (paidByMethod[refundMethod] <= 0) {
    throw validationError(`No ${refundMethod} payment on this cheque to refund`);
  }

  const remaining = paidByMethod[refundMethod] - refundedByMethod[refundMethod];
  if (refundAmount > remaining + 0.009) {
    throw validationError('Refund amount exceeds remaining payment for this method');
  }

  const totalPaid = cheque.payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalRefunded = (cheque.refunds ?? []).reduce((s, r) => s + Number(r.amount), 0);
  if (totalRefunded + refundAmount > totalPaid + 0.009) {
    throw validationError('Total refunds cannot exceed cheque payments');
  }

  const { initiator, approver } = await verifyDualManagerApproval(venueId, {
    restaurantManagerPin,
    generalManagerPin,
  });

  const resolvedCashierId = cashierId ?? cheque.cashierId;
  const matchingPayment =
    cheque.payments.find((p) => p.method === refundMethod) ?? cheque.payments[0];

  let activeShift = null;
  if (terminalId && refundMethod === 'cash') {
    try {
      activeShift = await requireActiveShift(resolvedCashierId, terminalId, venueId);
    } catch {
      activeShift = null;
    }
  }

  const refund = await prisma.refund.create({
    data: {
      chequeId,
      paymentId: matchingPayment?.id ?? null,
      cashierId: resolvedCashierId,
      shiftId: activeShift?.id ?? null,
      initiatorId: initiator.id,
      approverId: approver.id,
      method: refundMethod,
      amount: refundAmount,
      reason: reason.trim(),
    },
  });

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  const serialized = serializeCheque(await loadCheque(chequeId));
  const receipt = buildRefundReceiptText(serialized, venue, refund);

  return {
    cheque: await getCheque(chequeId, venueId),
    refund: {
      id: refund.id,
      amount: refundAmount,
      method: refundMethod,
      processedAt: refund.processedAt,
    },
    receipt,
  };
}

export async function listRefundAudits(venueId, { limit = 50 } = {}) {
  const rows = await prisma.refund.findMany({
    where: { cheque: { venueId } },
    orderBy: { processedAt: 'desc' },
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
    method: row.method,
    reason: row.reason,
    processedAt: row.processedAt.toISOString(),
    initiator: row.initiator.username,
    approver: row.approver.username,
  }));
}
