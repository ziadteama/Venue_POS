import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { validationError } from '../utils/errors.js';
import { resolveDashboardManager } from './auth-service.js';
import { executeSplitRefund } from './cheque-refund.js';
import {
  BILLABLE_ORDER_STATUSES,
  VOIDABLE_ROUND_STATUSES,
  computeProportionalPaidRefund,
  itemLineTotal,
  loadCheque,
  ordersFromCheque,
} from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';
import {
  isCrossVenueShellMember,
  loadCrossVenueGroupMembers,
  memberHasCrossVenueBillableContent,
} from './cross-venue-service.js';

function orderBillableSubtotal(order) {
  return order.items.reduce((sum, item) => sum + itemLineTotal(item), 0);
}

async function refundPaidAdjustment(cheque, amount, reason, manager, venueId, terminalId) {
  if (amount <= 0) return;
  await executeSplitRefund(
    cheque.id,
    {
      amount,
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
  { managerPin, reason, initiatorId },
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

  const manager = await resolveDashboardManager(venueId, { initiatorId, managerPin });
  const isPaid = cheque.status === 'paid';
  const roundSubtotal = isPaid ? orderBillableSubtotal(order) : 0;
  const roundAmount = isPaid ? computeProportionalPaidRefund(cheque, roundSubtotal) : 0;
  // #region agent log
  fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',runId:'post-fix',hypothesisId:'A',location:'cheque-manager.js:voidChequeRound',message:'paid void refund amounts',data:{chequeId,orderId,chequeStatus:cheque.status,orderStatus:order.status,isPaid,roundSubtotal,roundAmount,venueId},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',runId:'pre-fix',hypothesisId:'C',location:'cheque-manager.js:voidChequeRound',message:'executing refund adjustment',data:{chequeId,refundAmount:roundAmount},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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

async function voidOpenChequeInTx(tx, cheque, { managerId, reason }) {
  const ordersToVoid = ordersFromCheque(cheque).filter((o) =>
    VOIDABLE_ROUND_STATUSES.includes(o.status),
  );
  const voidedOrderIds = [];

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
        approverId: managerId,
        reason: reason.trim(),
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'voided', closedAt: new Date() },
    });
  }
  await tx.cheque.update({
    where: { id: cheque.id },
    data: { status: 'voided', closedAt: new Date() },
  });

  return voidedOrderIds;
}

export async function voidOpenCheque(chequeId, { managerPin, reason, initiatorId }, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'open') throw validationError('Only open cheques can be voided');
  if (!reason?.trim()) throw validationError('Void reason is required');

  const manager = await resolveDashboardManager(venueId, { initiatorId, managerPin });

  if (
    config.featureCrossVenueBilling &&
    cheque.crossVenueGroupId &&
    isCrossVenueShellMember(cheque)
  ) {
    const members = await loadCrossVenueGroupMembers(cheque.crossVenueGroupId);
    const hasBillableSiblings = members.some(
      (m) => m.id !== chequeId && memberHasCrossVenueBillableContent(m),
    );
    if (hasBillableSiblings) {
      const openMembers = members.filter((m) => m.status === 'open');
      const voidedOrderIds = [];
      await prisma.$transaction(async (tx) => {
        for (const member of openMembers) {
          const ids = await voidOpenChequeInTx(tx, member, {
            managerId: manager.id,
            reason: reason.trim(),
          });
          voidedOrderIds.push(...ids);
        }
      });
      return { cheque: await getCheque(chequeId, venueId), voidedOrderIds };
    }
  }

  const voidedOrderIds = await prisma.$transaction(async (tx) =>
    voidOpenChequeInTx(tx, cheque, { managerId: manager.id, reason: reason.trim() }),
  );

  return { cheque: await getCheque(chequeId, venueId), voidedOrderIds };
}

export async function compChequeItem(
  chequeId,
  orderId,
  itemId,
  { managerPin, reason, initiatorId },
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

  const manager = await resolveDashboardManager(venueId, { initiatorId, managerPin });
  const isPaid = cheque.status === 'paid';
  const lineSubtotal = isPaid ? itemLineTotal(item) : 0;
  const lineAmount = isPaid ? computeProportionalPaidRefund(cheque, lineSubtotal) : 0;

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
