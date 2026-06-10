import { prisma } from '../db/prisma.js';
import { tableLabelsMatch } from '@venue-pos/shared';
import {
  linkOrphanBillableOrdersToOpenCheque,
  linkOrphanDraftOrdersToOpenCheque,
  reconcileVenueOpenCheques,
} from './cheque-reconcile.js';
import { validationError } from '../utils/errors.js';
import { assertTableAssigned } from './venue-config-service.js';
import { occupyFloorTable, releaseFloorTable } from './floor-table-service.js';
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
  canRemoveEmptyCheque,
} from './cheque-shared.js';
import {
  clearCrossVenueGroupDrafts,
  fireCrossVenueGroupByCheque,
  getCrossVenueGroup,
  getCrossVenueGroupSummary,
} from './cross-venue-service.js';
import { config } from '../config.js';
import { resolveBusinessDate } from '../utils/business-date.js';

export async function openOrResumeCheque({ venueId, terminalId, cashierId, tableLabel }) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) throw validationError('Table label is required');
  await assertTableAssigned(venueId, trimmed);

  const openParents = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: null },
    include: chequeInclude,
    orderBy: { openedAt: 'asc' },
  });
  let cheque = openParents.find((row) => tableLabelsMatch(row.tableLabel, trimmed)) ?? null;

  if (!cheque) {
    const businessDate = resolveBusinessDate();
    cheque = await prisma.$transaction(async (tx) => {
      const chequeNumber = await nextChequeNumber(tx, businessDate);
      return tx.cheque.create({
        data: {
          venueId,
          terminalId,
          cashierId,
          chequeNumber,
          businessDate,
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
      businessDate,
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

  const crossVenueGroup =
    cheque.crossVenueGroupId && config.featureCrossVenueBilling
      ? await getCrossVenueGroup(cheque.crossVenueGroupId, venueId).catch(() => null)
      : null;

  return { ...serializeCheque(cheque), crossVenueGroup };
}

export async function closeEmptyCheque(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (!canRemoveEmptyCheque(cheque)) {
    if (cheque.status !== 'open') throw validationError('Cheque is not open');
    if (cheque.parentChequeId) throw validationError('Cannot remove a split sub-cheque');
    if (cheque.childCheques?.some((child) => child.status === 'open')) {
      throw validationError('Cannot remove a table with open split cheques');
    }
    if (computeChequeSubtotal(cheque) > 0) {
      throw validationError('Cannot remove a table with fired items');
    }
    throw validationError('Clear the current round before removing table');
  }

  const orders = ordersFromCheque(cheque);
  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      await tx.order.delete({ where: { id: order.id } });
    }
    await tx.floorTable.updateMany({
      where: { occupiedByChequeId: chequeId },
      data: { occupiedByChequeId: null, lockedByTerminalId: null },
    });
    await tx.cheque.delete({ where: { id: chequeId } });
  });

  return { deleted: true, id: chequeId, tableLabel: cheque.tableLabel };
}

export async function listOpenCheques(venueId) {
  await reconcileVenueOpenCheques(venueId);
  const cheques = (await listChequesForVenue(venueId, { status: 'open' })).filter(
    (cheque) => !cheque.parentChequeId,
  );
  if (!config.featureCrossVenueBilling) return cheques;

  return Promise.all(
    cheques.map(async (c) => {
      if (!c.crossVenueGroupId) return c;
      try {
        const group = await getCrossVenueGroup(c.crossVenueGroupId, venueId);
        return { ...c, total: group.displayTotal, crossVenueDisplayTotal: group.displayTotal };
      } catch {
        return c;
      }
    }),
  );
}

export async function listChequesForVenue(venueId, { status = 'open', limit = 50, q } = {}) {
  const where = { venueId, status };
  const trimmed = q?.trim();
  if (trimmed) {
    const asNum = Number(trimmed);
    if (!Number.isNaN(asNum) && String(asNum) === trimmed) {
      where.OR = [
        { chequeNumber: asNum },
        { tableLabel: { contains: trimmed, mode: 'insensitive' } },
      ];
    } else {
      where.tableLabel = { contains: trimmed, mode: 'insensitive' };
    }
  }

  const cheques = await prisma.cheque.findMany({
    where,
    include: chequeInclude,
    orderBy: status === 'paid' ? { closedAt: 'desc' } : { openedAt: 'asc' },
    take: limit,
  });
  return cheques.map(serializeCheque);
}

export async function getCheque(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  const crossVenueGroup =
    cheque.crossVenueGroupId && config.featureCrossVenueBilling
      ? await getCrossVenueGroupSummary(cheque.crossVenueGroupId)
      : null;
  return { ...serializeCheque(cheque), crossVenueGroup };
}

export async function fireChequeRound(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');

  if (cheque.crossVenueGroupId && config.featureCrossVenueBilling) {
    const groupResult = await fireCrossVenueGroupByCheque({
      anchorChequeId: chequeId,
      anchorVenueId: venueId,
      anchorTerminalId: cheque.terminalId,
      cashierId: cheque.cashierId,
    });
    if (groupResult) {
      const updated = await loadCheque(chequeId);
      return {
        sentOrder: groupResult.sentOrders[0] ?? null,
        sentOrders: groupResult.sentOrders,
        cheque: serializeCheque(updated),
        crossVenueGroup: groupResult.group,
      };
    }
  }

  let draft = findDraftOrder(cheque);
  if (!draft) {
    const recovered = await createOrder({
      venueId: cheque.venueId,
      terminalId: cheque.terminalId,
      cashierId: cheque.cashierId,
      tableLabel: cheque.tableLabel,
      businessDate: cheque.businessDate,
      skipValidation: true,
    });
    await linkDraftOrder(cheque.id, recovered.id);
    const reloaded = await loadCheque(cheque.id);
    draft = findDraftOrder(reloaded);
    if (!draft) throw validationError('No draft order on this cheque');
  }
  if (!draft.items.length) throw validationError('Cannot send an empty order');

  const sentOrder = await sendOrderToKitchen(draft.id);

  const nextDraft = await createOrder({
    venueId: cheque.venueId,
    terminalId: cheque.terminalId,
    cashierId: cheque.cashierId,
    tableLabel: cheque.tableLabel,
    businessDate: cheque.businessDate,
    skipValidation: true,
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

  if (cheque.crossVenueGroupId && config.featureCrossVenueBilling) {
    const cleared = await clearCrossVenueGroupDrafts(chequeId, venueId);
    if (cleared) {
      return { ...cleared.cheque, crossVenueGroup: cleared.group };
    }
  }

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

export async function moveChequeTable(chequeId, { targetTableLabel }, venueId, { terminalId, io } = {}) {
  const trimmed = targetTableLabel?.trim();
  if (!trimmed) throw validationError('Target table label is required');

  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (cheque.status !== 'open') throw validationError('Cheque is not open');
  if (cheque.parentChequeId) throw validationError('Cannot move a split sub-cheque');
  if (tableLabelsMatch(cheque.tableLabel, trimmed)) {
    return getCheque(chequeId, venueId);
  }

  await assertTableAssigned(venueId, trimmed);

  const conflict = await prisma.cheque.findFirst({
    where: { venueId, tableLabel: trimmed, status: 'open', id: { not: chequeId } },
    select: { id: true },
  });
  if (conflict) throw validationError('Another cheque is already open for that table');

  const oldLabel = cheque.tableLabel;

  await prisma.$transaction(async (tx) => {
    await tx.cheque.update({ where: { id: chequeId }, data: { tableLabel: trimmed } });
    await tx.order.updateMany({
      where: { chequeId: chequeId },
      data: { tableLabel: trimmed },
    });
  });

  await releaseFloorTable({ tableLabel: oldLabel, chequeId, io });
  await occupyFloorTable({ tableLabel: trimmed, venueId, chequeId, terminalId, io });

  return getCheque(chequeId, venueId);
}
