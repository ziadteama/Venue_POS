import { ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { forbidden, validationError } from '../utils/errors.js';
import { verifyManagerPin, verifyFloorManagerPin } from './auth-service.js';
import { appendAuditLog } from './audit-log-service.js';
export { forceHubRefund as forceChequeRefund } from './approval-request-service.js';
import {
  assertDiscountAllowed,
  executeChequeDiscount,
  listDiscountAudits,
  removeChequeDiscount,
  resolveDiscountAmount,
  updateChequeDiscount,
} from './cheque-discount.js';
import {
  applyCrossVenueGroupDiscount,
  removeCrossVenueGroupDiscount,
  updateCrossVenueGroupDiscount,
} from './cross-venue-service.js';
import { assertRefundAllowed, executeRefund, listRefundAudits } from './cheque-refund.js';
import { listTransferAudits } from './cheque-transfer.js';
import { loadCheque } from './cheque-shared.js';

async function resolveVenueManager(venueId, { initiatorId, restaurantManagerPin, managerPin }) {
  if (initiatorId) {
    const user = await prisma.user.findUnique({ where: { id: initiatorId } });
    if (!user?.isActive) throw forbidden('Manager not authorized for this venue');
    if (user.role === ROLES.HUB_MANAGER) return user;
    if (user.role === ROLES.VENUE_MANAGER && user.venueId === venueId) return user;
    throw forbidden('Manager not authorized for this venue');
  }
  const pin = restaurantManagerPin ?? managerPin;
  if (!pin) throw validationError('Venue manager PIN is required');
  return verifyManagerPin(venueId, pin);
}

/** POS — cashier performs action; optional floor PIN co-signs. Dashboard uses initiatorId (JWT). */
async function resolvePosActionActors(venueId, { cashierId, restaurantManagerPin, initiatorId }) {
  if (initiatorId) {
    const manager = await resolveVenueManager(venueId, { initiatorId, restaurantManagerPin });
    return { initiator: manager, approver: manager, notifyManager: manager };
  }

  if (!cashierId) throw validationError('cashierId is required');

  const cashier = await prisma.user.findUnique({ where: { id: cashierId } });
  if (!cashier?.isActive || cashier.role !== ROLES.CASHIER) {
    throw validationError('Invalid cashier');
  }
  if (cashier.venueId !== venueId) {
    throw validationError('Cashier does not belong to this venue');
  }

  const floorManager = await prisma.user.findFirst({
    where: { venueId, role: ROLES.VENUE_MANAGER, isActive: true },
    orderBy: { username: 'asc' },
  });

  if (restaurantManagerPin?.length >= 4) {
    const pinManager = await verifyFloorManagerPin(venueId, restaurantManagerPin);
    return { initiator: cashier, approver: pinManager, notifyManager: pinManager };
  }

  return {
    initiator: cashier,
    approver: floorManager ?? cashier,
    notifyManager: floorManager ?? cashier,
  };
}

async function auditPosManagerAction({
  venueId,
  action,
  actors,
  cheque,
  summary,
  details,
}) {
  await appendAuditLog({
    venueId,
    actorId: actors.initiator.id,
    actorUsername: actors.initiator.username,
    action,
    entityType: 'cheque',
    entityId: cheque.id,
    summary,
    details: {
      chequeNumber: cheque.chequeNumber,
      tableLabel: cheque.tableLabel,
      initiator: actors.initiator.username,
      approver: actors.approver.username,
      ...details,
    },
  });
}

export async function applyChequeDiscount(
  chequeId,
  { amount, percent, reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (!reason?.trim()) throw validationError('Discount reason is required');

  if (cheque.crossVenueGroupId && config.featureCrossVenueBilling) {
    if (amount != null) throw validationError('Cross-venue discounts must use percent only');
    const actors = await resolvePosActionActors(venueId, {
      initiatorId,
      restaurantManagerPin,
      cashierId: cashierId ?? cheque.cashierId,
    });
    return applyCrossVenueGroupDiscount({
      anchorChequeId: chequeId,
      anchorVenueId: venueId,
      percent,
      reason,
      initiatorId: actors.initiator.id,
      approverId: actors.approver.id,
      cashierId: cashierId ?? cheque.cashierId,
    });
  }

  assertDiscountAllowed(cheque);
  resolveDiscountAmount(cheque, { amount, percent });
  const actors = await resolvePosActionActors(venueId, {
    initiatorId,
    restaurantManagerPin,
    cashierId: cashierId ?? cheque.cashierId,
  });

  const result = await executeChequeDiscount(
    chequeId,
    {
      amount,
      percent,
      reason,
      initiatorId: actors.initiator.id,
      approverId: actors.approver.id,
      cashierId: cashierId ?? cheque.cashierId,
    },
    venueId,
  );

  await auditPosManagerAction({
    venueId,
    action: 'discount.applied',
    actors,
    cheque,
    summary: `Discount applied on cheque #${cheque.chequeNumber}`,
    details: { amount, percent, reason: reason.trim() },
  });

  return result;
}

export async function changeChequeDiscount(
  chequeId,
  { amount, percent, reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (!reason?.trim()) throw validationError('Discount reason is required');

  if (cheque.crossVenueGroupId && config.featureCrossVenueBilling) {
    if (amount != null) throw validationError('Cross-venue discounts must use percent only');
    const actors = await resolvePosActionActors(venueId, {
      initiatorId,
      restaurantManagerPin,
      cashierId: cashierId ?? cheque.cashierId,
    });
    return updateCrossVenueGroupDiscount({
      anchorChequeId: chequeId,
      anchorVenueId: venueId,
      percent,
      reason,
      initiatorId: actors.initiator.id,
      approverId: actors.approver.id,
      cashierId: cashierId ?? cheque.cashierId,
    });
  }

  assertDiscountAllowed(cheque);
  resolveDiscountAmount(cheque, { amount, percent });
  const actors = await resolvePosActionActors(venueId, {
    initiatorId,
    restaurantManagerPin,
    cashierId: cashierId ?? cheque.cashierId,
  });

  const result = await updateChequeDiscount(
    chequeId,
    {
      amount,
      percent,
      reason,
      initiatorId: actors.initiator.id,
      approverId: actors.approver.id,
      cashierId: cashierId ?? cheque.cashierId,
    },
    venueId,
  );

  await auditPosManagerAction({
    venueId,
    action: 'discount.changed',
    actors,
    cheque,
    summary: `Discount changed on cheque #${cheque.chequeNumber}`,
    details: { amount, percent, reason: reason.trim() },
  });

  return result;
}

export async function removeAppliedChequeDiscount(
  chequeId,
  { reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (!reason?.trim()) throw validationError('Discount reason is required');

  if (cheque.crossVenueGroupId && config.featureCrossVenueBilling) {
    const actors = await resolvePosActionActors(venueId, {
      initiatorId,
      restaurantManagerPin,
      cashierId: cashierId ?? cheque.cashierId,
    });
    return removeCrossVenueGroupDiscount({
      anchorChequeId: chequeId,
      anchorVenueId: venueId,
      reason,
      initiatorId: actors.initiator.id,
      approverId: actors.approver.id,
      cashierId: cashierId ?? cheque.cashierId,
    });
  }

  assertDiscountAllowed(cheque);
  const actors = await resolvePosActionActors(venueId, {
    initiatorId,
    restaurantManagerPin,
    cashierId: cashierId ?? cheque.cashierId,
  });

  const result = await removeChequeDiscount(
    chequeId,
    {
      reason,
      initiatorId: actors.initiator.id,
      approverId: actors.approver.id,
      cashierId: cashierId ?? cheque.cashierId,
    },
    venueId,
  );

  await auditPosManagerAction({
    venueId,
    action: 'discount.removed',
    actors,
    cheque,
    summary: `Discount removed on cheque #${cheque.chequeNumber}`,
    details: { reason: reason.trim() },
  });

  return result;
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

  const actors = await resolvePosActionActors(venueId, {
    initiatorId,
    restaurantManagerPin,
    cashierId: cashierId ?? cheque.cashierId,
  });

  const result = {
    ...(await executeRefund(
      chequeId,
      {
        amount,
        method,
        reason,
        initiatorId: actors.initiator.id,
        approverId: actors.approver.id,
        cashierId: cashierId ?? cheque.cashierId,
        terminalId,
      },
      venueId,
    )),
    manager: { id: actors.notifyManager.id, username: actors.notifyManager.username },
    cashier: { id: actors.initiator.id, username: actors.initiator.username },
  };

  await auditPosManagerAction({
    venueId,
    action: 'refund.processed',
    actors,
    cheque,
    summary: `Refund ${Number(amount)} ${method ?? 'cash'} on cheque #${cheque.chequeNumber}`,
    details: { amount: Number(amount), method: method ?? 'cash', reason: reason.trim() },
  });

  return result;
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
      order: {
        select: {
          orderNumber: true,
          tableLabel: true,
          chequeLink: {
            select: {
              chequeId: true,
              cheque: { select: { chequeNumber: true, tableLabel: true } },
            },
          },
        },
      },
      cashier: { select: { username: true } },
      approver: { select: { username: true, role: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    chequeId: row.order.chequeLink?.chequeId ?? null,
    chequeNumber: row.order.chequeLink?.cheque?.chequeNumber ?? null,
    orderNumber: row.order.orderNumber,
    tableLabel: row.order.tableLabel ?? row.order.chequeLink?.cheque?.tableLabel ?? null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    cashier: row.cashier.username,
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
      chequeId: row.chequeId,
      chequeNumber: row.chequeNumber,
      tableLabel: row.tableLabel,
      amount: row.amount,
      percent: row.percent,
      previousAmount: row.previousAmount,
      detail: row.detail,
      reason: row.reason,
      initiator: row.initiator,
      manager: row.approver,
      approver: row.approver,
    })),
    ...refunds.map((row) => ({
      id: row.id,
      type: 'refund',
      at: row.processedAt,
      chequeId: row.chequeId,
      chequeNumber: row.chequeNumber,
      tableLabel: row.tableLabel,
      amount: row.amount,
      method: row.method,
      detail: row.method,
      reason: row.reason,
      initiator: row.initiator,
      manager: row.approver,
      approver: row.approver,
    })),
    ...transfers.map((row) => ({
      id: row.id,
      type: 'transfer',
      at: row.createdAt,
      chequeId: row.sourceChequeId,
      targetChequeId: row.targetChequeId,
      chequeNumber: row.sourceChequeNumber,
      targetChequeNumber: row.targetChequeNumber,
      tableLabel: row.sourceTable,
      targetTable: row.targetTable,
      itemName: row.itemNameEn,
      amount: null,
      detail: `→ #${row.targetChequeNumber}`,
      reason: row.reason,
      cashier: row.cashierUsername,
      manager: row.approverUsername,
      approver: row.approverUsername,
    })),
    ...comps.map((row) => ({
      id: row.id,
      type: 'comp',
      at: row.createdAt,
      chequeId: row.chequeId,
      chequeNumber: row.chequeNumber,
      tableLabel: row.tableLabel,
      itemName: row.itemName,
      amount: null,
      detail: row.itemName,
      reason: row.reason,
      manager: row.manager,
      approver: row.manager,
    })),
    ...voids.map((row) => ({
      id: row.id,
      type: 'void',
      at: row.createdAt,
      chequeId: row.chequeId,
      orderId: row.orderId,
      chequeNumber: row.chequeNumber,
      orderNumber: row.orderNumber,
      tableLabel: row.tableLabel,
      amount: null,
      detail: `Round #${row.orderNumber}`,
      reason: row.reason,
      cashier: row.cashier,
      manager: row.manager,
      approver: row.manager,
    })),
  ];

  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
