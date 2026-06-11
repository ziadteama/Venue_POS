import { prisma } from '../db/prisma.js';
import {
  tableLabelsMatch,
  CHEQUE_SERVICE_MODES,
  TAKEAWAY_TABLE_LABEL,
  isTakeawayServiceMode,
} from '@venue-pos/shared';
import {
  linkOrphanBillableOrdersToOpenCheque,
  linkOrphanDraftOrdersToOpenCheque,
  reconcileVenueOpenCheques,
} from './cheque-reconcile.js';
import { validationError } from '../utils/errors.js';
import {
  assertTableAvailable,
  resolveHubTable,
  syncChequeOrdersFloorTable,
} from './hub-table-service.js';
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
  isCrossVenueShellMember,
  shouldHideCrossVenueShellInVenueList,
} from './cross-venue-service.js';
import { config } from '../config.js';
import { resolveBusinessDate } from '../utils/business-date.js';
import { overlayHubBillingOnCheques } from './hub-billing-service.js';

export async function openOrResumeCheque({
  venueId,
  terminalId,
  cashierId,
  tableLabel,
  serviceMode = CHEQUE_SERVICE_MODES.DINE_IN,
}) {
  if (isTakeawayServiceMode(serviceMode)) {
    return openOrResumeTakeawayCheque({ venueId, terminalId, cashierId });
  }
  return openOrResumeDineInCheque({ venueId, terminalId, cashierId, tableLabel });
}

async function openOrResumeTakeawayCheque({ venueId, terminalId, cashierId }) {
  const label = TAKEAWAY_TABLE_LABEL;
  let cheque = await prisma.cheque.findFirst({
    where: {
      venueId,
      status: 'open',
      parentChequeId: null,
      serviceMode: CHEQUE_SERVICE_MODES.TAKEAWAY,
    },
    include: chequeInclude,
    orderBy: { openedAt: 'asc' },
  });

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
          tableLabel: label,
          floorTableId: null,
          serviceMode: CHEQUE_SERVICE_MODES.TAKEAWAY,
          status: 'open',
        },
      });
    });

    const draft = await createOrder({
      venueId,
      terminalId,
      cashierId,
      tableLabel: label,
      floorTableId: null,
      businessDate,
    });
    await linkDraftOrder(cheque.id, draft.id);
    cheque = await loadCheque(cheque.id);
  } else {
    await ensureDraftOrder(cheque, {
      venueId,
      terminalId,
      cashierId,
      tableLabel: label,
      floorTableId: null,
    });
    cheque = await loadCheque(cheque.id);
  }

  await linkOrphanBillableOrdersToOpenCheque(cheque.id, venueId, label);
  await linkOrphanDraftOrdersToOpenCheque(cheque.id, venueId, label);
  cheque = await loadCheque(cheque.id);

  const crossVenueGroup =
    cheque.crossVenueGroupId && config.featureCrossVenueBilling
      ? await getCrossVenueGroup(cheque.crossVenueGroupId, venueId).catch(() => null)
      : null;

  return { ...serializeCheque(cheque), crossVenueGroup };
}

async function openOrResumeDineInCheque({ venueId, terminalId, cashierId, tableLabel }) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) throw validationError('Table label is required');
  const hubTable = await resolveHubTable(trimmed);

  const openParents = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: null },
    include: chequeInclude,
    orderBy: { openedAt: 'asc' },
  });
  let cheque =
    openParents.find(
      (row) =>
        row.floorTableId === hubTable.id || tableLabelsMatch(row.tableLabel, hubTable.tableLabel),
    ) ?? null;

  if (!cheque) {
    await assertTableAvailable(hubTable.id, {});
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
          tableLabel: hubTable.tableLabel,
          floorTableId: hubTable.id,
          serviceMode: CHEQUE_SERVICE_MODES.DINE_IN,
          status: 'open',
        },
      });
    });

    const draft = await createOrder({
      venueId,
      terminalId,
      cashierId,
      tableLabel: hubTable.tableLabel,
      floorTableId: hubTable.id,
      businessDate,
    });
    await linkDraftOrder(cheque.id, draft.id);
    cheque = await loadCheque(cheque.id);
  } else {
    await assertTableAvailable(hubTable.id, {
      chequeId: cheque.id,
      crossVenueGroupId: cheque.crossVenueGroupId,
    });
    if (!cheque.floorTableId || cheque.tableLabel !== hubTable.tableLabel) {
      await prisma.$transaction(async (tx) => {
        await tx.cheque.update({
          where: { id: cheque.id },
          data: { floorTableId: hubTable.id, tableLabel: hubTable.tableLabel },
        });
        await syncChequeOrdersFloorTable(tx, cheque.id, hubTable.id, hubTable.tableLabel);
      });
    }
    await ensureDraftOrder(cheque, {
      venueId,
      terminalId,
      cashierId,
      tableLabel: hubTable.tableLabel,
      floorTableId: hubTable.id,
    });
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

export async function listOpenCheques(venueId, { hideCrossVenueShells = false } = {}) {
  await reconcileVenueOpenCheques(venueId);
  let cheques = (await listChequesForVenue(venueId, {
    status: 'open',
    hideCrossVenueShells,
  })).filter((cheque) => !cheque.parentChequeId);
  if (!config.featureCrossVenueBilling) return cheques;

  return Promise.all(
    cheques.map(async (c) => {
      if (!c.crossVenueGroupId) return c;
      try {
        const group = await getCrossVenueGroup(c.crossVenueGroupId, venueId);
        const enriched = { ...c, total: group.displayTotal, crossVenueDisplayTotal: group.displayTotal };
        if (isCrossVenueShellMember(await loadCheque(c.id))) {
          enriched.isCrossVenueShell = true;
        }
        return enriched;
      } catch {
        return c;
      }
    }),
  );
}

async function chequeIdsForShift(shiftId, venueId, status) {
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, venueId },
    select: { id: true, cashierId: true, terminalId: true, openedAt: true, closedAt: true },
  });
  if (!shift) return [];

  const ids = new Set();

  const paymentRows = await prisma.payment.findMany({
    where: { shiftId, cheque: { venueId, status } },
    select: { chequeId: true },
    distinct: ['chequeId'],
  });
  for (const row of paymentRows) ids.add(row.chequeId);

  if (status === 'open') {
    const openRows = await prisma.cheque.findMany({
      where: {
        venueId,
        status: 'open',
        cashierId: shift.cashierId,
        ...(shift.terminalId ? { terminalId: shift.terminalId } : {}),
        openedAt: {
          gte: shift.openedAt,
          ...(shift.closedAt ? { lte: shift.closedAt } : {}),
        },
      },
      select: { id: true },
    });
    for (const row of openRows) ids.add(row.id);
  }

  return [...ids];
}

export async function listChequesForVenue(
  venueId,
  { status = 'open', limit = 50, q, shiftId, hideCrossVenueShells = false } = {},
) {
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

  if (shiftId) {
    const shiftChequeIds = await chequeIdsForShift(shiftId, venueId, status);
    if (!shiftChequeIds.length) return [];
    where.id = { in: shiftChequeIds };
  }

  const cheques = await prisma.cheque.findMany({
    where,
    include: chequeInclude,
    orderBy: status === 'paid' ? { closedAt: 'desc' } : { openedAt: 'asc' },
    take: limit,
  });
  const withHubBilling = await overlayHubBillingOnCheques(cheques);
  if (!hideCrossVenueShells || !config.featureCrossVenueBilling) {
    return withHubBilling.map(serializeCheque);
  }

  const visibility = await Promise.all(
    withHubBilling.map((c) => shouldHideCrossVenueShellInVenueList(c).then((hide) => !hide)),
  );
  return withHubBilling.filter((_, i) => visibility[i]).map(serializeCheque);
}

/** Hub manager: find cheques across all venues (numeric cheque # or table label). */
export async function searchChequesHubWide({
  status = 'open',
  q,
  limit = 50,
  hideCrossVenueShells = false,
} = {}) {
  const trimmed = q?.trim();
  if (!trimmed) return [];

  const where = { status };
  const asNum = Number(trimmed);
  if (!Number.isNaN(asNum) && String(asNum) === trimmed) {
    where.chequeNumber = asNum;
  } else {
    where.tableLabel = { contains: trimmed, mode: 'insensitive' };
  }

  const cheques = await prisma.cheque.findMany({
    where,
    include: {
      ...chequeInclude,
      venue: { select: { id: true, nameEn: true, nameAr: true } },
    },
    orderBy: status === 'paid' ? { closedAt: 'desc' } : { openedAt: 'asc' },
    take: limit,
  });

  let rows = cheques;
  if (hideCrossVenueShells && config.featureCrossVenueBilling) {
    const visibility = await Promise.all(
      cheques.map((c) => shouldHideCrossVenueShellInVenueList(c).then((hide) => !hide)),
    );
    rows = cheques.filter((_, i) => visibility[i]);
  }

  return rows.map((c) => ({
    ...serializeCheque(c),
    venueNameEn: c.venue.nameEn,
    venueNameAr: c.venue.nameAr,
  }));
}

export async function getCheque(chequeId, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  const crossVenueGroup =
    cheque.crossVenueGroupId && config.featureCrossVenueBilling
      ? await getCrossVenueGroup(cheque.crossVenueGroupId, venueId)
      : null;
  const serialized = serializeCheque(cheque);
  if (isCrossVenueShellMember(cheque)) {
    return {
      ...serialized,
      isCrossVenueShell: true,
      crossVenueGroup,
    };
  }
  return { ...serialized, crossVenueGroup };
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
  if (isTakeawayServiceMode(cheque.serviceMode)) {
    throw validationError('Cannot move a takeaway order to a table');
  }

  const hubTable = await resolveHubTable(trimmed);
  if (cheque.floorTableId === hubTable.id) {
    return getCheque(chequeId, venueId);
  }

  await assertTableAvailable(hubTable.id, {
    chequeId,
    crossVenueGroupId: cheque.crossVenueGroupId,
  });

  const oldFloorTableId = cheque.floorTableId;

  await prisma.$transaction(async (tx) => {
    await tx.cheque.update({
      where: { id: chequeId },
      data: { tableLabel: hubTable.tableLabel, floorTableId: hubTable.id },
    });
    await syncChequeOrdersFloorTable(tx, chequeId, hubTable.id, hubTable.tableLabel);
  });

  if (oldFloorTableId) {
    await releaseFloorTable({ floorTableId: oldFloorTableId, chequeId, io });
  }
  await occupyFloorTable({
    tableLabel: hubTable.tableLabel,
    floorTableId: hubTable.id,
    venueId,
    chequeId,
    crossVenueGroupId: cheque.crossVenueGroupId,
    terminalId,
    io,
  });

  return getCheque(chequeId, venueId);
}
