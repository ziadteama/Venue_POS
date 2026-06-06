import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';
import { verifyManagerPinByRole } from './auth-service.js';
import { executeRefund } from './cheque-refund.js';
import {
  BILLABLE_ORDER_STATUSES,
  VOIDABLE_ROUND_STATUSES,
  itemLineTotal,
  loadCheque,
  ordersFromCheque,
} from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';

function orderBillableSubtotal(order) {
  return order.items.reduce((sum, item) => sum + itemLineTotal(item), 0);
}

function primaryRefundMethod(cheque) {
  const cash = cheque.payments?.find((p) => p.method === 'cash');
  if (cash) return 'cash';
  return cheque.payments?.[0]?.method ?? 'cash';
}

async function refundPaidAdjustment(cheque, amount, reason, manager, venueId, terminalId) {
  if (amount <= 0) return;
  await executeRefund(
    cheque.id,
    {
      amount,
      method: primaryRefundMethod(cheque),
      reason,
      initiatorId: manager.id,
      approverId: manager.id,
      cashierId: cheque.cashierId,
      terminalId,
    },
    venueId,
  );
}

export async function voidChequeRound(
  chequeId,
  orderId,
  { managerPin, reason },
  venueId,
  { terminalId } = {},
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (!['open', 'paid'].includes(cheque.status)) {
    throw validationError('Only open or paid cheques can have rounds voided');
  }

  const order = ordersFromCheque(cheque).find((o) => o.id === orderId);
  if (!order) throw validationError('Order not on this cheque');
  if (!VOIDABLE_ROUND_STATUSES.includes(order.status)) {
    throw validationError('Order cannot be voided');
  }
  if (!reason?.trim()) throw validationError('Void reason is required');

  const manager = await verifyManagerPinByRole(venueId, managerPin, 'venue_manager');
  const isPaid = cheque.status === 'paid';
  const roundAmount = isPaid ? orderBillableSubtotal(order) : 0;

  if (order.status === 'draft' && !order.items.length) {
    await prisma.order.delete({ where: { id: orderId } });
    return { cheque: await getCheque(chequeId, venueId), voidedOrderId: orderId };
  }

  await prisma.$transaction([
    prisma.orderVoidAudit.create({
      data: {
        orderId,
        cashierId: cheque.cashierId,
        approverId: manager.id,
        reason: reason.trim(),
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { status: 'voided', closedAt: new Date() },
    }),
  ]);

  if (isPaid && roundAmount > 0) {
    await refundPaidAdjustment(
      cheque,
      roundAmount,
      `Void round adjustment: ${reason.trim()}`,
      manager,
      venueId,
      terminalId,
    );
  }

  return { cheque: await getCheque(chequeId, venueId), voidedOrderId: orderId };
}

export async function voidOpenCheque(chequeId, { managerPin, reason }, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'open') throw validationError('Only open cheques can be voided');
  if (!reason?.trim()) throw validationError('Void reason is required');

  const manager = await verifyManagerPinByRole(venueId, managerPin, 'venue_manager');
  const ordersToVoid = ordersFromCheque(cheque).filter((o) =>
    VOIDABLE_ROUND_STATUSES.includes(o.status),
  );

  const voidedOrderIds = [];

  await prisma.$transaction(async (tx) => {
    for (const order of ordersToVoid) {
      if (order.status === 'draft' && !order.items.length) {
        await tx.order.delete({ where: { id: order.id } });
        continue;
      }
      voidedOrderIds.push(order.id);
      await tx.orderVoidAudit.create({
        data: {
          orderId: order.id,
          cashierId: cheque.cashierId,
          approverId: manager.id,
          reason: reason.trim(),
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'voided', closedAt: new Date() },
      });
    }
    await tx.cheque.update({
      where: { id: chequeId },
      data: { status: 'voided', closedAt: new Date() },
    });
  });

  return { cheque: await getCheque(chequeId, venueId), voidedOrderIds };
}

export async function compChequeItem(
  chequeId,
  orderId,
  itemId,
  { managerPin, reason },
  venueId,
  { terminalId } = {},
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (!['open', 'paid'].includes(cheque.status)) {
    throw validationError('Only open or paid cheques can have items comped');
  }

  const order = ordersFromCheque(cheque).find((o) => o.id === orderId);
  if (!order) throw validationError('Order not on this cheque');
  if (!BILLABLE_ORDER_STATUSES.includes(order.status)) {
    throw validationError('Only fired kitchen rounds can be comped');
  }

  const item = order.items.find((i) => i.id === itemId);
  if (!item) throw validationError('Item not found on order');
  if (item.isComped) throw validationError('Item is already comped');
  if (!reason?.trim()) throw validationError('Comp reason is required');

  const manager = await verifyManagerPinByRole(venueId, managerPin, 'venue_manager');
  const isPaid = cheque.status === 'paid';
  const lineAmount = isPaid ? itemLineTotal(item) : 0;

  await prisma.$transaction([
    prisma.orderItemCompAudit.create({
      data: {
        orderItemId: itemId,
        chequeId,
        cashierId: cheque.cashierId,
        approverId: manager.id,
        reason: reason.trim(),
      },
    }),
    prisma.orderItem.update({
      where: { id: itemId },
      data: { isComped: true },
    }),
  ]);

  if (isPaid && lineAmount > 0) {
    await refundPaidAdjustment(
      cheque,
      lineAmount,
      `Comp adjustment: ${reason.trim()}`,
      manager,
      venueId,
      terminalId,
    );
  }

  return getCheque(chequeId, venueId);
}
