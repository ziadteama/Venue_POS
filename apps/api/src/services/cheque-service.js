import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import { serializeOrder, buildChequeReceiptText } from '../utils/serialize.js';
import { verifyManagerPin } from './auth-service.js';
import { createOrder, sendOrderToKitchen } from './order-service.js';

const chequeOrderInclude = {
  order: {
    include: {
      items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' } },
    },
  },
};

const chequeInclude = {
  orders: { include: chequeOrderInclude, orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { processedAt: 'desc' } },
};

const BILLABLE_ORDER_STATUSES = ['sent', 'partially_ready', 'ready', 'served'];
const VOIDABLE_ROUND_STATUSES = ['draft', 'sent', 'partially_ready', 'ready', 'served'];

function ordersFromCheque(cheque) {
  return cheque.orders.map((link) => link.order);
}

function findDraftOrder(cheque) {
  return ordersFromCheque(cheque).find((o) => o.status === 'draft') ?? null;
}

function computeOrderSubtotal(order) {
  return serializeOrder(order).subtotal;
}

function computeChequeTotal(cheque) {
  return ordersFromCheque(cheque)
    .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
    .reduce((sum, order) => sum + computeOrderSubtotal(order), 0);
}

export function serializeCheque(cheque) {
  const orders = ordersFromCheque(cheque).map(serializeOrder);
  const draftOrder = orders.find((o) => o.status === 'draft') ?? null;

  let total = orders
    .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
    .reduce((sum, o) => sum + o.subtotal, 0);

  if (cheque.status === 'paid' && cheque.payments?.length) {
    total = cheque.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  } else if (cheque.status !== 'open') {
    total = orders
      .filter((o) => o.status === 'closed')
      .reduce((sum, o) => sum + o.subtotal, 0);
  }

  return {
    id: cheque.id,
    venueId: cheque.venueId,
    terminalId: cheque.terminalId,
    cashierId: cheque.cashierId,
    chequeNumber: cheque.chequeNumber,
    tableLabel: cheque.tableLabel,
    status: cheque.status,
    openedAt: cheque.openedAt,
    closedAt: cheque.closedAt ?? null,
    total,
    orders,
    draftOrder,
    payments:
      cheque.payments?.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        processedAt: p.processedAt,
        cashierId: p.cashierId,
      })) ?? [],
  };
}

async function loadCheque(chequeId) {
  const cheque = await prisma.cheque.findUnique({
    where: { id: chequeId },
    include: chequeInclude,
  });
  if (!cheque) throw notFound('Cheque not found');
  return cheque;
}

async function nextChequeNumber(tx, venueId) {
  const last = await tx.cheque.findFirst({
    where: { venueId },
    orderBy: { chequeNumber: 'desc' },
    select: { chequeNumber: true },
  });
  return (last?.chequeNumber ?? 0) + 1;
}

async function linkDraftOrder(chequeId, orderId) {
  await prisma.chequeOrder.create({ data: { chequeId, orderId } });
}

async function ensureDraftOrder(cheque, { venueId, terminalId, cashierId }) {
  const draft = findDraftOrder(cheque);
  if (draft) return draft;

  const created = await createOrder({
    venueId,
    terminalId,
    cashierId,
    tableLabel: cheque.tableLabel,
  });
  await linkDraftOrder(cheque.id, created.id);
  return created;
}

export async function openOrResumeCheque({ venueId, terminalId, cashierId, tableLabel }) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) throw validationError('Table label is required');

  let cheque = await prisma.cheque.findFirst({
    where: { venueId, tableLabel: trimmed, status: 'open' },
    include: chequeInclude,
  });

  if (!cheque) {
    cheque = await prisma.$transaction(async (tx) => {
      const chequeNumber = await nextChequeNumber(tx, venueId);
      const created = await tx.cheque.create({
        data: {
          venueId,
          terminalId,
          cashierId,
          chequeNumber,
          tableLabel: trimmed,
          status: 'open',
        },
      });
      return created;
    });

    const draft = await createOrder({
      venueId,
      terminalId,
      cashierId,
      tableLabel: trimmed,
    });
    await linkDraftOrder(cheque.id, draft.id);
    cheque = await loadCheque(cheque.id);
  } else {
    await ensureDraftOrder(cheque, { venueId, terminalId, cashierId });
    cheque = await loadCheque(cheque.id);
  }

  return serializeCheque(cheque);
}

export async function listOpenCheques(venueId) {
  return listChequesForVenue(venueId, { status: 'open' });
}

export async function listChequesForVenue(venueId, { status = 'open', limit = 50 } = {}) {
  const cheques = await prisma.cheque.findMany({
    where: { venueId, status },
    include: chequeInclude,
    orderBy: status === 'paid' ? { closedAt: 'desc' } : { openedAt: 'asc' },
    take: limit,
  });
  return cheques.map(serializeCheque);
}

export async function getCheque(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  return serializeCheque(cheque);
}

export async function fireChequeRound(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');

  const draft = findDraftOrder(cheque);
  if (!draft) throw validationError('No draft order on this cheque');
  if (!draft.items.length) throw validationError('Cannot send an empty order');

  const sentOrder = await sendOrderToKitchen(draft.id);

  const nextDraft = await createOrder({
    venueId: cheque.venueId,
    terminalId: cheque.terminalId,
    cashierId: cheque.cashierId,
    tableLabel: cheque.tableLabel,
  });
  await linkDraftOrder(cheque.id, nextDraft.id);

  const updated = await loadCheque(cheque.id);
  return {
    sentOrder,
    cheque: serializeCheque(updated),
  };
}

export async function clearChequeDraft(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');

  const draft = findDraftOrder(cheque);
  if (draft?.items?.length) {
    await prisma.order.delete({ where: { id: draft.id } });
  }

  await ensureDraftOrder(
    await loadCheque(chequeId),
    { venueId: cheque.venueId, terminalId: cheque.terminalId, cashierId: cheque.cashierId },
  );

  return getCheque(chequeId, venueId);
}

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

  const draft = findDraftOrder(cheque);
  if (draft?.items?.length) {
    throw validationError('Send or clear the current round before paying');
  }

  const total = computeChequeTotal(cheque);
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

    await tx.cheque.update({
      where: { id: chequeId },
      data: { status: 'paid', closedAt: new Date() },
    });

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
  });

  const paid = await getCheque(chequeId, venueId);
  const receipt = await getChequeReceipt(chequeId, venueId, {
    tendered: tendered ?? undefined,
    change: change ?? undefined,
  });

  return { cheque: paid, receipt: receipt.text, change };
}

export async function voidChequeRound(chequeId, orderId, { managerPin, reason }, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'open') throw validationError('Only open cheques can have rounds voided');

  const order = ordersFromCheque(cheque).find((o) => o.id === orderId);
  if (!order) throw validationError('Order not on this cheque');
  if (!VOIDABLE_ROUND_STATUSES.includes(order.status)) {
    throw validationError('Order cannot be voided');
  }
  if (!reason?.trim()) throw validationError('Void reason is required');

  const approver = await verifyManagerPin(venueId, managerPin);

  if (order.status === 'draft' && !order.items.length) {
    await prisma.order.delete({ where: { id: orderId } });
    return { cheque: await getCheque(chequeId, venueId), voidedOrderId: orderId };
  }

  await prisma.$transaction([
    prisma.orderVoidAudit.create({
      data: {
        orderId,
        cashierId: cheque.cashierId,
        approverId: approver.id,
        reason: reason.trim(),
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { status: 'voided', closedAt: new Date() },
    }),
  ]);

  return { cheque: await getCheque(chequeId, venueId), voidedOrderId: orderId };
}

export async function voidOpenCheque(chequeId, { managerPin, reason }, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'open') throw validationError('Only open cheques can be voided');
  if (!reason?.trim()) throw validationError('Void reason is required');

  const approver = await verifyManagerPin(venueId, managerPin);
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
          approverId: approver.id,
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

export async function compChequeItem(chequeId, orderId, itemId, { managerPin, reason }, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'open') throw validationError('Only open cheques can have items comped');

  const order = ordersFromCheque(cheque).find((o) => o.id === orderId);
  if (!order) throw validationError('Order not on this cheque');
  if (!BILLABLE_ORDER_STATUSES.includes(order.status)) {
    throw validationError('Only fired kitchen rounds can be comped');
  }

  const item = order.items.find((i) => i.id === itemId);
  if (!item) throw validationError('Item not found on order');
  if (item.isComped) throw validationError('Item is already comped');
  if (!reason?.trim()) throw validationError('Comp reason is required');

  const approver = await verifyManagerPin(venueId, managerPin);

  await prisma.$transaction([
    prisma.orderItemCompAudit.create({
      data: {
        orderItemId: itemId,
        chequeId,
        cashierId: cheque.cashierId,
        approverId: approver.id,
        reason: reason.trim(),
      },
    }),
    prisma.orderItem.update({
      where: { id: itemId },
      data: { isComped: true },
    }),
  ]);

  return getCheque(chequeId, venueId);
}
