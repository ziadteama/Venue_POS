import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';
import {
  BILLABLE_ORDER_STATUSES,
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
      const chequeNumber = await nextChequeNumber(tx, venueId);
      const child = await tx.cheque.create({
        data: {
          venueId: cheque.venueId,
          terminalId: cheque.terminalId,
          cashierId: cheque.cashierId,
          chequeNumber,
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
