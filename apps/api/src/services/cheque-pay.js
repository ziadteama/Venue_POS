import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { validationError } from '../utils/errors.js';
import { assertManualCardPaymentsAllowed } from './payment-policy.js';
import {
  buildChequeReceiptText,
  buildFullSplitReceiptText,
  buildRestaurantReceiptText,
} from '../utils/serialize.js';
import {
  BILLABLE_ORDER_STATUSES,
  billingOrdersFromCheque,
  chequeOrderInclude,
  findDraftOrder,
  itemBelongsToCheque,
  computeChequeTotal,
  loadCheque,
  ordersFromCheque,
  serializeCheque,
} from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';
import { getCrossVenueGroup, payCrossVenueGroup } from './cross-venue-service.js';
import { requireActiveShift } from './shift-service.js';

function normalizePayments({ payments, method, amount }, total) {
  let lines = payments;
  if (!lines?.length) {
    lines = [{ method: method ?? 'cash', amount: amount != null ? Number(amount) : total }];
  }

  const sum = lines.reduce((s, p) => s + Number(p.amount), 0);
  if (Math.abs(sum - total) > 0.009) {
    throw validationError('Payment total must match cheque total');
  }

  return lines.map((p) => ({
    method: p.method,
    amount: Number(p.amount),
    cardLast4: p.cardLast4?.trim() || null,
  }));
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

  const amountOnlySplit =
    children.length > 0 && children.every((c) => c.splitAmount != null);

  if (!amountOnlySplit) {
    const parentRemainder = billableItems.filter((i) => !i.billingChequeId);
    if (parentRemainder.some((i) => !i.paidAt)) return;

    const allocated = billableItems.filter((i) => i.billingChequeId);
    if (allocated.some((i) => !i.paidAt)) return;
  } else {
    const unpaidIds = billableItems.filter((i) => !i.paidAt).map((i) => i.id);
    if (unpaidIds.length) {
      await tx.orderItem.updateMany({
        where: { id: { in: unpaidIds } },
        data: { paidAt: new Date() },
      });
    }
  }

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

export async function getChequeReceipt(
  chequeId,
  venueId,
  { tendered, change, preview, copyNumber } = {},
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  const serialized = serializeCheque(cheque);
  const resolvedCopy =
    copyNumber ?? (preview ? serialized.prePaymentCheckPrintCount || undefined : undefined);
  return {
    text: buildChequeReceiptText(serialized, venue, {
      tendered,
      change,
      preview,
      copyNumber: resolvedCopy,
    }),
    cheque: serialized,
  };
}

export async function getRestaurantChequeReceipt(
  chequeId,
  venueId,
  { tendered, change } = {},
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  const serialized = serializeCheque(cheque);
  return {
    text: buildRestaurantReceiptText(serialized, venue, { tendered, change }),
    cheque: serialized,
  };
}

export async function getSplitReceiptBundle(parentChequeId, venueId) {
  const parent = await loadCheque(parentChequeId);
  if (parent.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (parent.parentChequeId) throw validationError('Not a table cheque');

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  const serializedParent = serializeCheque(parent);
  const childRows = parent.childCheques ?? [];

  const separate = [];
  for (const row of childRows) {
    const child = await loadCheque(row.id);
    const serialized = serializeCheque(child);
    separate.push({
      id: child.id,
      splitLabel: child.splitLabel,
      chequeNumber: child.chequeNumber,
      total: serialized.total,
      text: buildChequeReceiptText(serialized, venue, { preview: true }),
    });
  }

  const childSerialized = await Promise.all(
    childRows.map(async (row) => serializeCheque(await loadCheque(row.id))),
  );

  return {
    full: buildFullSplitReceiptText(serializedParent, childSerialized, venue),
    separate,
    parentRemainder: buildChequeReceiptText(serializedParent, venue, { preview: true }),
  };
}

export async function isTableFullySettled(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) return false;
  const rootId = cheque.parentChequeId ?? cheque.id;
  const root = rootId === cheque.id ? cheque : await loadCheque(rootId);
  return root.status === 'paid';
}

export async function payCheque(
  chequeId,
  { cashierId, payments, method, amount, tendered, terminalId, managerPin },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');

  if (cheque.crossVenueGroupId && config.featureCrossVenueBilling && !cheque.parentChequeId) {
    const group = await getCrossVenueGroup(cheque.crossVenueGroupId, venueId);
    const paymentLines = normalizePayments(
      { payments, method, amount },
      group.combinedTotal,
    );
    const result = await payCrossVenueGroup({
      groupId: cheque.crossVenueGroupId,
      anchorVenueId: venueId,
      anchorTerminalId: terminalId,
      cashierId,
      payments: paymentLines,
      tendered,
      managerPin,
    });
    const anchorCheque =
      result.group.cheques.find((c) => c.id === chequeId) ?? result.group.cheques[0];
    const restaurantReceipt = result.receipt.replace(
      /^CROSS-VENUE SETTLEMENT/m,
      'CROSS-VENUE SETTLEMENT\n*** RESTAURANT COPY ***',
    );
    return {
      text: result.receipt,
      receipt: result.receipt,
      restaurantReceipt,
      change: result.change,
      crossVenueGroup: result.group,
      cheque: anchorCheque,
      tableSettled: true,
    };
  }

  const draft = cheque.parentChequeId ? null : findDraftOrder(cheque);
  if (draft?.items?.length) {
    throw validationError('Send or clear the current round before paying');
  }

  const isParent = !cheque.parentChequeId;
  const isAmountSplitChild = cheque.splitAmount != null;
  let itemsToPay = [];
  let total = 0;

  if (isAmountSplitChild) {
    total = Number(cheque.splitAmount);
    itemsToPay = [];
  } else {
    itemsToPay = billingOrdersFromCheque(cheque)
      .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
      .flatMap((o) => o.items)
      .filter((item) => itemBelongsToCheque(item, cheque.id, isParent));
    total = computeChequeTotal(cheque);
  }

  if (total <= 0) throw validationError('Nothing to pay on this cheque');

  const paymentLines = normalizePayments({ payments, method, amount }, total);

  for (const line of paymentLines) {
    if (line.cardLast4 && !/^\d{4}$/.test(line.cardLast4)) {
      throw validationError('Card last-4 must be exactly 4 digits');
    }
    if (line.cardLast4 && line.method !== 'card') {
      throw validationError('Card last-4 is only valid for card payments');
    }
  }

  await assertManualCardPaymentsAllowed(paymentLines, {
    manualCardEnabled: config.featureManualCardEnabled,
    approvalThreshold: config.manualCardApprovalThreshold,
    managerPin,
    venueId,
  });

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
  const skipItemPaidMark = isAmountSplitChild;

  const activeShift = terminalId
    ? await requireActiveShift(cashierId, terminalId, venueId)
    : null;

  await prisma.$transaction(async (tx) => {
    for (const line of paymentLines) {
      await tx.payment.create({
        data: {
          chequeId,
          cashierId,
          shiftId: activeShift?.id ?? null,
          method: line.method,
          amount: line.amount,
          cardLast4: line.method === 'card' ? line.cardLast4 : null,
        },
      });
    }

    if (!skipItemPaidMark && itemIds.length) {
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { paidAt: new Date() },
      });
    }

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
  const receiptOpts = {
    tendered: tendered ?? undefined,
    change: change ?? undefined,
  };
  const receipt = await getChequeReceipt(chequeId, venueId, receiptOpts);
  const restaurantReceipt = await getRestaurantChequeReceipt(chequeId, venueId, receiptOpts);
  const rootId = paid.parentChequeId ?? paid.id;
  const tableSettled = await isTableFullySettled(rootId, venueId);

  return {
    cheque: paid,
    receipt: receipt.text,
    restaurantReceipt: restaurantReceipt.text,
    change,
    tableSettled,
  };
}
