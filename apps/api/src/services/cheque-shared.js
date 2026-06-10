import { VOIDABLE_ROUND_STATUSES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { notFound } from '../utils/errors.js';
import { serializeOrder } from '../utils/serialize.js';
import { computeVenueCharges } from '../utils/venue-charges.js';
import { createOrder } from './order-service.js';
import { resolveBusinessDate } from '../utils/business-date.js';

export const chequeOrderInclude = {
  order: {
    include: {
      items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' } },
    },
  },
};

export const chequeInclude = {
  venue: {
    select: {
      taxRate: true,
      taxInclusive: true,
      serviceRate: true,
      serviceEnabled: true,
    },
  },
  orders: { include: chequeOrderInclude, orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { processedAt: 'desc' } },
  discountAudits: { orderBy: { createdAt: 'desc' }, take: 10 },
  refunds: { orderBy: { processedAt: 'desc' } },
  childCheques: {
    include: { payments: { orderBy: { processedAt: 'desc' } } },
    orderBy: { chequeNumber: 'asc' },
  },
  parentCheque: {
    include: {
      orders: { include: chequeOrderInclude, orderBy: { createdAt: 'asc' } },
    },
  },
};

export const BILLABLE_ORDER_STATUSES = ['sent', 'partially_ready', 'ready', 'served'];
export { VOIDABLE_ROUND_STATUSES };

export function ordersFromCheque(cheque) {
  return cheque.orders.map((link) => link.order);
}

export function findDraftOrder(cheque) {
  return ordersFromCheque(cheque).find((o) => o.status === 'draft') ?? null;
}

export function itemLineTotal(item) {
  if (item.isComped) return 0;
  const mods =
    item.modifiersSnapshot?.reduce((s, m) => s + Number(m.priceDelta ?? 0), 0) ?? 0;
  return (Number(item.unitPrice) + mods) * item.quantity;
}

export function billingOrdersFromCheque(cheque) {
  if (cheque.parentChequeId && cheque.parentCheque) {
    return ordersFromCheque(cheque.parentCheque);
  }
  return ordersFromCheque(cheque);
}

export function itemBelongsToCheque(item, chequeId, isParentCheque, forDisplay = false) {
  if (!forDisplay && item.paidAt) return false;
  if (isParentCheque) {
    if (forDisplay && item.paidAt) return !item.billingChequeId;
    return !item.billingChequeId && !item.paidAt;
  }
  if (forDisplay) return item.billingChequeId === chequeId;
  return item.billingChequeId === chequeId && !item.paidAt;
}

export function filterOrderForCheque(order, chequeId, isParentCheque, forDisplay = false) {
  const serialized = serializeOrder(order);
  const items = serialized.items.filter((item) =>
    itemBelongsToCheque(item, chequeId, isParentCheque, forDisplay),
  );
  const subtotal = items.reduce((sum, item) => {
    if (item.isComped) return sum;
    const mods =
      item.modifiersSnapshot?.reduce((m, mod) => m + Number(mod.priceDelta ?? 0), 0) ?? 0;
    return sum + (Number(item.unitPrice) + mods) * item.quantity;
  }, 0);
  return { ...serialized, items, subtotal };
}

export function computeChequeSubtotal(cheque) {
  if (cheque.splitAmount != null) {
    return Number(cheque.splitAmount);
  }

  const isParent = !cheque.parentChequeId;
  let itemTotal = billingOrdersFromCheque(cheque)
    .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
    .flatMap((o) => o.items)
    .filter((item) => itemBelongsToCheque(item, cheque.id, isParent))
    .reduce((sum, item) => sum + itemLineTotal(item), 0);

  if (isParent && cheque.childCheques?.length) {
    const amountChildren = cheque.childCheques.filter((c) => c.splitAmount != null);
    if (amountChildren.length) {
      const allocated = amountChildren.reduce((s, c) => s + Number(c.splitAmount), 0);
      return Math.max(0, Number((itemTotal - allocated).toFixed(2)));
    }
  }

  return itemTotal;
}

/** True when an open parent cheque has no queued or billable fired lines left. */
export function canRemoveEmptyCheque(cheque) {
  if (!cheque || cheque.status !== 'open') return false;
  if (cheque.parentChequeId) return false;
  if (cheque.crossVenueGroupId) return false;
  if (cheque.childCheques?.some((child) => child.status === 'open')) return false;
  if (computeChequeSubtotal(cheque) > 0) return false;
  const drafts = ordersFromCheque(cheque).filter((order) => order.status === 'draft');
  if (drafts.some((draft) => draft.items?.length)) return false;
  return true;
}

/** True when an open split sub-cheque has no allocated billable lines left. */
export function canRemoveEmptySplitCheque(cheque) {
  if (!cheque || cheque.status !== 'open' || !cheque.parentChequeId) return false;
  if (cheque.splitAmount != null) return false;
  const parent = cheque.parentCheque;
  if (!parent || parent.status !== 'open') return false;

  const hasAllocatedItems = billingOrdersFromCheque({ ...cheque, parentCheque: parent })
    .flatMap((order) => order.items)
    .some((item) => item.billingChequeId === cheque.id && !item.paidAt);
  if (hasAllocatedItems) return false;

  return computeChequeSubtotal({ ...cheque, parentCheque: parent }) <= 0;
}

export function computeChequeTotal(cheque) {
  const subtotal = computeChequeSubtotal(cheque);
  const discount = Number(cheque.discountAmount ?? 0);
  const net = Math.max(0, Number((subtotal - discount).toFixed(2)));
  return computeVenueCharges(net, cheque.venue).total;
}

export function computeChequeFeeBreakdown(cheque) {
  const subtotal = computeChequeSubtotal(cheque);
  const discount = Number(cheque.discountAmount ?? 0);
  const net = Math.max(0, Number((subtotal - discount).toFixed(2)));
  return { netSubtotal: net, ...computeVenueCharges(net, cheque.venue) };
}

function serializeChildSummary(child, parentCheque) {
  let total;
  if (child.splitAmount != null) {
    total = Number(child.splitAmount);
  } else if (child.status === 'paid' && child.payments?.length) {
    total = child.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  } else {
    total = billingOrdersFromCheque({ ...child, parentCheque })
      .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
      .flatMap((o) => o.items)
      .filter((item) => itemBelongsToCheque(item, child.id, false))
      .reduce((sum, item) => sum + itemLineTotal(item), 0);
  }

  return {
    id: child.id,
    chequeNumber: child.chequeNumber,
    splitLabel: child.splitLabel,
    splitAmount: child.splitAmount != null ? Number(child.splitAmount) : null,
    status: child.status,
    total,
  };
}

export function serializeCheque(cheque) {
  const isParent = !cheque.parentChequeId;
  const forDisplay = cheque.status !== 'open';
  const rawOrders = billingOrdersFromCheque(cheque);
  const orders = rawOrders
    .filter((o) => isParent || o.status !== 'draft')
    .map((o) => filterOrderForCheque(o, cheque.id, isParent, forDisplay))
    .filter((o) => {
      if (o.status === 'draft') return true;
      if (forDisplay && (o.status === 'closed' || o.status === 'voided')) return true;
      return o.items.length > 0;
    });
  const draftOrder = isParent ? (orders.find((o) => o.status === 'draft') ?? null) : null;

  const subtotalBeforeDiscount = computeChequeSubtotal(cheque);
  const discountAmount = Number(cheque.discountAmount ?? 0);
  const fees = computeChequeFeeBreakdown(cheque);
  let total = fees.total;

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
    businessDate: cheque.businessDate,
    tableLabel: cheque.tableLabel,
    splitLabel: cheque.splitLabel ?? null,
    splitAmount: cheque.splitAmount != null ? Number(cheque.splitAmount) : null,
    discountAmount,
    subtotalBeforeDiscount,
    serviceAmount: fees.serviceAmount,
    taxAmount: fees.taxAmount,
    parentChequeId: cheque.parentChequeId ?? null,
    isCrossVenue: Boolean(cheque.isCrossVenue),
    crossVenueGroupId: cheque.crossVenueGroupId ?? null,
    status: cheque.status,
    openedAt: cheque.openedAt,
    closedAt: cheque.closedAt ?? null,
    total,
    orders,
    draftOrder,
    parentCheque: cheque.parentCheque
      ? {
          id: cheque.parentCheque.id,
          chequeNumber: cheque.parentCheque.chequeNumber,
          tableLabel: cheque.parentCheque.tableLabel,
        }
      : null,
    childCheques:
      cheque.childCheques?.map((child) => serializeChildSummary(child, cheque)) ?? [],
    payments:
      cheque.payments?.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        cardLast4: p.cardLast4 ?? null,
        processedAt: p.processedAt,
        cashierId: p.cashierId,
      })) ?? [],
    refunds:
      cheque.refunds?.map((r) => ({
        id: r.id,
        method: r.method,
        amount: Number(r.amount),
        reason: r.reason,
        processedAt: r.processedAt,
        initiatorId: r.initiatorId,
        approverId: r.approverId,
      })) ?? [],
  };
}

export async function loadCheque(chequeId) {
  const cheque = await prisma.cheque.findUnique({
    where: { id: chequeId },
    include: chequeInclude,
  });
  if (!cheque) throw notFound('Cheque not found');
  return cheque;
}

/** Allocate next hub-wide cheque number for a business date (all venues share one sequence). */
export async function nextChequeNumber(tx, businessDate = resolveBusinessDate()) {
  const date =
    businessDate instanceof Date
      ? businessDate
      : new Date(`${String(businessDate).slice(0, 10)}T00:00:00.000Z`);

  const existing = await tx.chequeNumberCounter.findUnique({
    where: { businessDate: date },
  });
  if (!existing) {
    const maxRow = await tx.cheque.findFirst({
      where: { businessDate: date },
      orderBy: { chequeNumber: 'desc' },
      select: { chequeNumber: true },
    });
    await tx.chequeNumberCounter.create({
      data: { businessDate: date, lastNumber: maxRow?.chequeNumber ?? 0 },
    });
  }

  const row = await tx.chequeNumberCounter.update({
    where: { businessDate: date },
    data: { lastNumber: { increment: 1 } },
  });
  return row.lastNumber;
}

export async function linkDraftOrder(chequeId, orderId) {
  await prisma.chequeOrder.create({ data: { chequeId, orderId } });
}

export async function ensureDraftOrder(cheque, { venueId, terminalId, cashierId }) {
  const draft = findDraftOrder(cheque);
  if (draft) return draft;

  const created = await createOrder({
    venueId,
    terminalId,
    cashierId,
    tableLabel: cheque.tableLabel,
    businessDate: cheque.businessDate,
    skipValidation: true,
  });
  await linkDraftOrder(cheque.id, created.id);
  return created;
}
