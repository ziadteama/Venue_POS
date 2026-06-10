import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';
import {
  BILLABLE_ORDER_STATUSES,
  billingOrdersFromCheque,
  findDraftOrder,
  loadCheque,
  nextChequeNumber,
  ordersFromCheque,
} from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';

export async function splitChequeByItems(chequeId, { splits }, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');
  if (cheque.parentChequeId) throw validationError('Cannot split a sub-cheque');
  if (hasAmountSplits(cheque)) throw validationError('Cheque already split by amount');

  const draft = findDraftOrder(cheque);
  if (draft?.items?.length) {
    throw validationError('Send or clear the current round before splitting');
  }

  if (!splits?.length) throw validationError('At least one split is required');

  const billableOrders = ordersFromCheque(cheque).filter((o) =>
    BILLABLE_ORDER_STATUSES.includes(o.status),
  );
  const allocatable = billableOrders
    .flatMap((o) => o.items)
    .filter((i) => !i.billingChequeId && !i.paidAt && !i.isComped);

  const requestedIds = new Set();

  for (const split of splits) {
    const label = split.label?.trim();
    if (!label) throw validationError('Each split needs a label');
    if (!split.itemIds?.length) throw validationError('Each split needs at least one item');

    for (const itemId of split.itemIds) {
      if (requestedIds.has(itemId)) {
        throw validationError('An item cannot appear in multiple splits');
      }
      requestedIds.add(itemId);
      if (!allocatable.some((i) => i.id === itemId)) {
        throw validationError('Invalid or already allocated item');
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const split of splits) {
      const chequeNumber = await nextChequeNumber(tx, cheque.businessDate);
      const child = await tx.cheque.create({
        data: {
          venueId: cheque.venueId,
          terminalId: cheque.terminalId,
          cashierId: cheque.cashierId,
          chequeNumber,
          businessDate: cheque.businessDate,
          tableLabel: cheque.tableLabel,
          splitLabel: split.label.trim(),
          parentChequeId: cheque.id,
          status: 'open',
        },
      });

      await tx.orderItem.updateMany({
        where: { id: { in: split.itemIds } },
        data: { billingChequeId: child.id },
      });
    }
  });

  return getCheque(chequeId, venueId);
}

function hasItemSplits(cheque) {
  return cheque.childCheques?.some((c) => c.splitAmount == null) ?? false;
}

function hasAmountSplits(cheque) {
  return cheque.childCheques?.some((c) => c.splitAmount != null) ?? false;
}

export async function splitChequeByAmount(chequeId, { splits }, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');
  if (cheque.parentChequeId) throw validationError('Cannot split a sub-cheque');
  if (hasItemSplits(cheque)) throw validationError('Cheque already split by item');

  const draft = findDraftOrder(cheque);
  if (draft?.items?.length) {
    throw validationError('Send or clear the current round before splitting');
  }

  if (!splits?.length) throw validationError('At least one split is required');

  const billableTotal = billingOrdersFromCheque(cheque)
    .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
    .flatMap((o) => o.items)
    .filter((i) => !i.billingChequeId && !i.paidAt && !i.isComped)
    .reduce((sum, item) => {
      const mods =
        item.modifiersSnapshot?.reduce((s, m) => s + Number(m.priceDelta ?? 0), 0) ?? 0;
      return sum + (Number(item.unitPrice) + mods) * item.quantity;
    }, 0);

  if (billableTotal <= 0) throw validationError('Nothing to split on this cheque');

  let splitSum = 0;
  for (const split of splits) {
    const label = split.label?.trim();
    const amount = Number(split.amount);
    if (!label) throw validationError('Each split needs a label');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw validationError('Each split needs a positive amount');
    }
    splitSum += amount;
  }

  if (Math.abs(splitSum - billableTotal) > 0.009) {
    throw validationError('Split amounts must equal cheque total');
  }

  if (hasAmountSplits(cheque)) {
    throw validationError('Cheque already split by amount');
  }

  await prisma.$transaction(async (tx) => {
    for (const split of splits) {
      const chequeNumber = await nextChequeNumber(tx, cheque.businessDate);
      await tx.cheque.create({
        data: {
          venueId: cheque.venueId,
          terminalId: cheque.terminalId,
          cashierId: cheque.cashierId,
          chequeNumber,
          businessDate: cheque.businessDate,
          tableLabel: cheque.tableLabel,
          splitLabel: split.label.trim(),
          splitAmount: Number(split.amount),
          parentChequeId: cheque.id,
          status: 'open',
        },
      });
    }
  });

  return getCheque(chequeId, venueId);
}
