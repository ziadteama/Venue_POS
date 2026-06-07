import { prisma } from '../db/prisma.js';
import { forbidden, validationError } from '../utils/errors.js';
import { verifyManagerPin, verifyManagerPinByRole } from './auth-service.js';
import {
  assertDiscountAllowed,
  executeChequeDiscount,
  listDiscountAudits,
  removeChequeDiscount,
  resolveDiscountAmount,
  updateChequeDiscount,
} from './cheque-discount.js';
import { assertRefundAllowed, executeRefund, listRefundAudits } from './cheque-refund.js';
import { listTransferAudits } from './cheque-transfer.js';
import { loadCheque } from './cheque-shared.js';

async function resolveVenueManager(venueId, { initiatorId, restaurantManagerPin }) {
  if (initiatorId) {
    const user = await prisma.user.findUnique({ where: { id: initiatorId } });
    if (!user?.isActive || user.venueId !== venueId) {
      throw forbidden('Manager not authorized for this venue');
    }
    if (!['venue_manager', 'hub_manager'].includes(user.role)) {
      throw forbidden('Only managers can perform this action');
    }
    return user;
  }
  if (!restaurantManagerPin) {
    throw validationError('Venue manager PIN is required');
  }
  return verifyManagerPin(venueId, restaurantManagerPin);
}

export async function applyChequeDiscount(
  chequeId,
  { amount, percent, reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  assertDiscountAllowed(cheque);
  if (!reason?.trim()) throw validationError('Discount reason is required');

  resolveDiscountAmount(cheque, { amount, percent });
  const manager = await resolveVenueManager(venueId, { initiatorId, restaurantManagerPin });

  return executeChequeDiscount(
    chequeId,
    {
      amount,
      percent,
      reason,
      initiatorId: manager.id,
      approverId: manager.id,
      cashierId: cashierId ?? cheque.cashierId,
    },
    venueId,
  );
}

export async function changeChequeDiscount(
  chequeId,
  { amount, percent, reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  assertDiscountAllowed(cheque);
  if (!reason?.trim()) throw validationError('Discount reason is required');

  resolveDiscountAmount(cheque, { amount, percent });
  const manager = await resolveVenueManager(venueId, { initiatorId, restaurantManagerPin });

  return updateChequeDiscount(
    chequeId,
    {
      amount,
      percent,
      reason,
      initiatorId: manager.id,
      approverId: manager.id,
      cashierId: cashierId ?? cheque.cashierId,
    },
    venueId,
  );
}

export async function removeAppliedChequeDiscount(
  chequeId,
  { reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  assertDiscountAllowed(cheque);
  if (!reason?.trim()) throw validationError('Discount reason is required');

  const manager = await resolveVenueManager(venueId, { initiatorId, restaurantManagerPin });

  return removeChequeDiscount(
    chequeId,
    {
      reason,
      initiatorId: manager.id,
      approverId: manager.id,
      cashierId: cashierId ?? cheque.cashierId,
    },
    venueId,
  );
}

export async function applyChequeRefund(
  chequeId,
  { amount, method, reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
  { terminalId } = {},
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  assertRefundAllowed(cheque, { amount, method });
  if (!reason?.trim()) throw validationError('Refund reason is required');

  const manager = await resolveVenueManager(venueId, { initiatorId, restaurantManagerPin });

  return executeRefund(
    chequeId,
    {
      amount,
      method,
      reason,
      initiatorId: manager.id,
      approverId: manager.id,
      cashierId: cashierId ?? cheque.cashierId,
      terminalId,
    },
    venueId,
  );
}

export async function listCompAudits(venueId, { limit = 50 } = {}) {
  const rows = await prisma.orderItemCompAudit.findMany({
    where: { cheque: { venueId } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      cheque: { select: { chequeNumber: true, tableLabel: true } },
      orderItem: {
        include: { menuItem: { select: { nameEn: true, nameAr: true } } },
      },
      approver: { select: { username: true, role: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    chequeId: row.chequeId,
    chequeNumber: row.cheque.chequeNumber,
    tableLabel: row.cheque.tableLabel,
    itemName: row.orderItem.menuItem.nameEn,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    manager: row.approver.username,
  }));
}

export async function listVoidAudits(venueId, { limit = 50 } = {}) {
  const rows = await prisma.orderVoidAudit.findMany({
    where: { order: { venueId } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      order: { select: { orderNumber: true, tableLabel: true } },
      approver: { select: { username: true, role: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    tableLabel: row.order.tableLabel,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    manager: row.approver.username,
  }));
}

export async function listManagerActivity(venueId, { limit = 100 } = {}) {
  const perSource = Math.max(limit, 30);
  const [discounts, refunds, transfers, comps, voids] = await Promise.all([
    listDiscountAudits(venueId, { limit: perSource }),
    listRefundAudits(venueId, { limit: perSource }),
    listTransferAudits(venueId, { limit: perSource }),
    listCompAudits(venueId, { limit: perSource }),
    listVoidAudits(venueId, { limit: perSource }),
  ]);

  const events = [
    ...discounts.map((row) => ({
      id: row.id,
      type: row.activityType,
      at: row.createdAt,
      chequeNumber: row.chequeNumber,
      tableLabel: row.tableLabel,
      amount: row.amount,
      detail: row.detail,
      reason: row.reason,
      manager: row.approver,
    })),
    ...refunds.map((row) => ({
      id: row.id,
      type: 'refund',
      at: row.processedAt,
      chequeNumber: row.chequeNumber,
      tableLabel: row.tableLabel,
      amount: row.amount,
      detail: row.method,
      reason: row.reason,
      manager: row.approver,
    })),
    ...transfers.map((row) => ({
      id: row.id,
      type: 'transfer',
      at: row.createdAt,
      chequeNumber: row.sourceChequeNumber,
      tableLabel: row.sourceTable,
      amount: null,
      detail: `→ #${row.targetChequeNumber}`,
      reason: row.reason,
      manager: row.approverUsername,
    })),
    ...comps.map((row) => ({
      id: row.id,
      type: 'comp',
      at: row.createdAt,
      chequeNumber: row.chequeNumber,
      tableLabel: row.tableLabel,
      amount: null,
      detail: row.itemName,
      reason: row.reason,
      manager: row.manager,
    })),
    ...voids.map((row) => ({
      id: row.id,
      type: 'void',
      at: row.createdAt,
      chequeNumber: null,
      tableLabel: row.tableLabel,
      amount: null,
      detail: `Round #${row.orderNumber}`,
      reason: row.reason,
      manager: row.manager,
    })),
  ];

  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
