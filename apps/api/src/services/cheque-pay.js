import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';
import { buildChequeReceiptText } from '../utils/serialize.js';
import {
  BILLABLE_ORDER_STATUSES,
  billingOrdersFromCheque,
  chequeOrderInclude,
  findDraftOrder,
  itemBelongsToCheque,
  itemLineTotal,
  loadCheque,
  ordersFromCheque,
  serializeCheque,
} from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';

function normalizePayments({ payments, method, amount }, total) {
  let lines = payments;
  if (!lines?.length) {
    lines = [{ method: method ?? 'cash', amount: amount != null ? Number(amount) : total }];
  }

  const sum = lines.reduce((s, p) => s + Number(p.amount), 0);
  if (Math.abs(sum - total) > 0.009) {
    throw validationError('Payment total must match cheque total');
  }

  return lines.map((p) => ({ method: p.method, amount: Number(p.amount) }));
}

async function maybeFinalizeSplitParent(tx, parentChequeId) {
  const parent = await tx.cheque.findUnique({
    where: { id: parentChequeId },
    include: {
      orders: { include: chequeOrderInclude, orderBy: { createdAt: 'asc' } },
      childCheques: true,
    },
  });
  if (!parent || parent.status !== 'open') return;

  const children = parent.childCheques;
  if (children.length && !children.every((c) => c.status === 'paid')) return;

  const orders = ordersFromCheque(parent);
  const billableItems = orders
    .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
    .flatMap((o) => o.items)
    .filter((i) => !i.isComped);

  const parentRemainder = billableItems.filter((i) => !i.billingChequeId);
  if (parentRemainder.some((i) => !i.paidAt)) return;

  const allocated = billableItems.filter((i) => i.billingChequeId);
  if (allocated.some((i) => !i.paidAt)) return;

  const orderIds = orders
    .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
    .map((o) => o.id);

  if (orderIds.length) {
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: 'closed', closedAt: new Date() },
    });
  }

  const draft = orders.find((o) => o.status === 'draft');
  if (draft && !draft.items.length) {
    await tx.order.delete({ where: { id: draft.id } });
  }

  await tx.cheque.update({
    where: { id: parentChequeId },
    data: { status: 'paid', closedAt: new Date() },
  });
}

export async function getChequeReceipt(chequeId, venueId, { tendered, change } = {}) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  const serialized = serializeCheque(cheque);
  return {
    text: buildChequeReceiptText(serialized, venue, { tendered, change }),
    cheque: serialized,
  };
}

export async function payCheque(
  chequeId,
  { cashierId, payments, method, amount, tendered },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');

  const draft = cheque.parentChequeId ? null : findDraftOrder(cheque);
  if (draft?.items?.length) {
    throw validationError('Send or clear the current round before paying');
  }

  const isParent = !cheque.parentChequeId;
  const itemsToPay = billingOrdersFromCheque(cheque)
    .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
    .flatMap((o) => o.items)
    .filter((item) => itemBelongsToCheque(item, cheque.id, isParent));

  const total = itemsToPay.reduce((sum, item) => sum + itemLineTotal(item), 0);
  if (total <= 0) throw validationError('Nothing to pay on this cheque');

  const paymentLines = normalizePayments({ payments, method, amount }, total);

  const cashTotal = paymentLines
    .filter((p) => p.method === 'cash')
    .reduce((s, p) => s + p.amount, 0);
  let change = null;
  if (tendered != null) {
    if (tendered < cashTotal) throw validationError('Tendered amount is less than cash due');
    change = Number((tendered - cashTotal).toFixed(2));
  }

  const itemIds = itemsToPay.map((i) => i.id);
  const parentChequeId = cheque.parentChequeId ?? null;

  await prisma.$transaction(async (tx) => {
    for (const line of paymentLines) {
      await tx.payment.create({
        data: {
          chequeId,
          cashierId,
          method: line.method,
          amount: line.amount,
        },
      });
    }

    await tx.orderItem.updateMany({
      where: { id: { in: itemIds } },
      data: { paidAt: new Date() },
    });

    await tx.cheque.update({
      where: { id: chequeId },
      data: { status: 'paid', closedAt: new Date() },
    });

    if (parentChequeId) {
      await maybeFinalizeSplitParent(tx, parentChequeId);
    } else if (cheque.childCheques?.length) {
      await maybeFinalizeSplitParent(tx, cheque.id);
    } else {
      const orderIds = ordersFromCheque(cheque)
        .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
        .map((o) => o.id);

      if (orderIds.length) {
        await tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: { status: 'closed', closedAt: new Date() },
        });
      }

      if (draft && !draft.items.length) {
        await tx.order.delete({ where: { id: draft.id } });
      }
    }
  });

  const paid = await getCheque(chequeId, venueId);
  const receipt = await getChequeReceipt(chequeId, venueId, {
    tendered: tendered ?? undefined,
    change: change ?? undefined,
  });

  return { cheque: paid, receipt: receipt.text, change };
}
