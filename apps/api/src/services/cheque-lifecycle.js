import { prisma } from '../db/prisma.js';
import {
  linkOrphanBillableOrdersToOpenCheque,
  linkOrphanDraftOrdersToOpenCheque,
  reconcileVenueOpenCheques,
} from './cheque-reconcile.js';
import { validationError } from '../utils/errors.js';
import { assertTableAssigned } from './venue-config-service.js';
import { createOrder, sendOrderToKitchen } from './order-service.js';
import {
  chequeInclude,
  findDraftOrder,
  loadCheque,
  linkDraftOrder,
  ensureDraftOrder,
  nextChequeNumber,
  serializeCheque,
  computeChequeSubtotal,
  ordersFromCheque,
} from './cheque-shared.js';
import { getCrossVenueGroupSummary } from './cross-venue-service.js';

export async function openOrResumeCheque({ venueId, terminalId, cashierId, tableLabel }) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) throw validationError('Table label is required');
  await assertTableAssigned(venueId, trimmed);

  let cheque = await prisma.cheque.findFirst({
    where: { venueId, tableLabel: trimmed, status: 'open', parentChequeId: null },
    include: chequeInclude,
  });

  if (!cheque) {
    cheque = await prisma.$transaction(async (tx) => {
      const chequeNumber = await nextChequeNumber(tx, venueId);
      return tx.cheque.create({
        data: {
          venueId,
          terminalId,
          cashierId,
          chequeNumber,
          tableLabel: trimmed,
          status: 'open',
        },
      });
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

  await linkOrphanBillableOrdersToOpenCheque(cheque.id, venueId, trimmed);
  await linkOrphanDraftOrdersToOpenCheque(cheque.id, venueId, trimmed);
  cheque = await loadCheque(cheque.id);

  return serializeCheque(cheque);
}

export async function closeEmptyCheque(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');
  if (cheque.parentChequeId) throw validationError('Cannot remove a split sub-cheque');
  if (cheque.childCheques?.length) {
    throw validationError('Cannot remove a table with split cheques');
  }

  if (computeChequeSubtotal(cheque) > 0) {
    throw validationError('Cannot remove a table with fired items');
  }
  const draft = findDraftOrder(cheque);
  if (draft?.items?.length) {
    throw validationError('Clear the current round before removing table');
  }

  const orders = ordersFromCheque(cheque);
  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      await tx.order.delete({ where: { id: order.id } });
    }
    await tx.cheque.delete({ where: { id: chequeId } });
  });

  return { deleted: true, id: chequeId };
}

export async function listOpenCheques(venueId) {
  await reconcileVenueOpenCheques(venueId);
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
  const crossVenueGroup = cheque.crossVenueGroupId
    ? await getCrossVenueGroupSummary(cheque.crossVenueGroupId)
    : null;
  return { ...serializeCheque(cheque), crossVenueGroup };
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
