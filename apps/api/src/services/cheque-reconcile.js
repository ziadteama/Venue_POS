import { prisma } from '../db/prisma.js';
import { normalizedTableKey, tableLabelsMatch } from '@venue-pos/shared';
import {
  BILLABLE_ORDER_STATUSES,
  billingOrdersFromCheque,
  chequeInclude,
  computeChequeSubtotal,
  ensureDraftOrder,
  findDraftOrder,
  itemBelongsToCheque,
  linkDraftOrder,
  loadCheque,
  nextChequeNumber,
  ordersFromCheque,
  canRemoveEmptyCheque,
  canRemoveEmptySplitCheque,
} from './cheque-shared.js';
import { serializeVenueTableLabels } from '../utils/venue-tables.js';
import { resolveBusinessDate } from '../utils/business-date.js';

export async function linkOrphanBillableOrdersToOpenCheque(chequeId, venueId, tableLabel) {
  const orphans = await prisma.order.findMany({
    where: {
      venueId,
      tableLabel,
      status: { in: BILLABLE_ORDER_STATUSES },
      chequeLink: null,
    },
    select: { id: true },
  });
  if (!orphans.length) return 0;

  await prisma.chequeOrder.createMany({
    data: orphans.map((o) => ({ chequeId, orderId: o.id })),
    skipDuplicates: true,
  });
  return orphans.length;
}

export async function consolidateChequeDraftOrders(chequeId) {
  const cheque = await loadCheque(chequeId);
  const drafts = ordersFromCheque(cheque).filter((o) => o.status === 'draft');
  if (drafts.length <= 1) return;

  const primary =
    drafts.find((d) => d.items.length > 0) ??
    [...drafts].sort((a, b) => a.openedAt - b.openedAt)[0];

  for (const extra of drafts) {
    if (extra.id === primary.id) continue;
    if (extra.items.length) {
      await prisma.orderItem.updateMany({
        where: { orderId: extra.id },
        data: { orderId: primary.id },
      });
    }
    await prisma.order.delete({ where: { id: extra.id } });
  }
}

export async function linkOrphanDraftOrdersToOpenCheque(chequeId, venueId, tableLabel) {
  let cheque = await loadCheque(chequeId);
  let draft = findDraftOrder(cheque);

  const orphans = await prisma.order.findMany({
    where: {
      venueId,
      tableLabel,
      businessDate: cheque.businessDate,
      status: 'draft',
      chequeLink: null,
    },
    include: { items: true },
    orderBy: { openedAt: 'asc' },
  });

  let linked = 0;
  for (const orphan of orphans) {
    if (!orphan.items.length) {
      await prisma.order.delete({ where: { id: orphan.id } });
      continue;
    }
    if (!draft) {
      await linkDraftOrder(chequeId, orphan.id);
      draft = orphan;
      linked += 1;
      continue;
    }
    if (orphan.id === draft.id) continue;
    await prisma.orderItem.updateMany({
      where: { orderId: orphan.id },
      data: { orderId: draft.id },
    });
    await prisma.order.delete({ where: { id: orphan.id } });
    linked += 1;
  }

  await consolidateChequeDraftOrders(chequeId);
  return linked;
}

export async function pruneEmptyOrphanDrafts(venueId) {
  const empty = await prisma.order.findMany({
    where: {
      venueId,
      status: 'draft',
      chequeLink: null,
      items: { none: {} },
    },
    select: { id: true },
  });
  if (!empty.length) return 0;
  await prisma.order.deleteMany({ where: { id: { in: empty.map((o) => o.id) } } });
  return empty.length;
}

export async function closeOrdersStuckOnPaidCheques(venueId) {
  const stuck = await prisma.order.findMany({
    where: {
      venueId,
      status: { in: BILLABLE_ORDER_STATUSES },
      chequeLink: { cheque: { status: 'paid' } },
    },
    select: { id: true },
  });
  if (!stuck.length) return 0;
  await prisma.order.updateMany({
    where: { id: { in: stuck.map((o) => o.id) } },
    data: { status: 'closed', closedAt: new Date() },
  });
  return stuck.length;
}

async function orphanBillableTables(venueId) {
  const rows = await prisma.order.groupBy({
    by: ['tableLabel'],
    where: {
      venueId,
      tableLabel: { not: null },
      status: { in: BILLABLE_ORDER_STATUSES },
      chequeLink: null,
    },
  });
  return rows.map((r) => r.tableLabel).filter(Boolean);
}

async function ensureOpenChequeForOrphanTable(venueId, tableLabel) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { tables: true },
  });
  const assigned = serializeVenueTableLabels(venue?.tables);
  if (assigned.length > 0 && !assigned.some((label) => tableLabelsMatch(label, tableLabel))) {
    return;
  }

  const sample = await prisma.order.findFirst({
    where: {
      venueId,
      tableLabel,
      status: { in: BILLABLE_ORDER_STATUSES },
      chequeLink: null,
    },
    orderBy: { openedAt: 'asc' },
  });
  if (!sample) return;

  const existing = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: null },
    select: { id: true, tableLabel: true },
  });
  const match = existing.find((row) => tableLabelsMatch(row.tableLabel, tableLabel));

  if (match) {
    await linkOrphanBillableOrdersToOpenCheque(match.id, venueId, tableLabel);
    return;
  }

  const businessDate = resolveBusinessDate();
  const cheque = await prisma.$transaction(async (tx) => {
    const chequeNumber = await nextChequeNumber(tx, venueId, businessDate);
    return tx.cheque.create({
      data: {
        venueId,
        terminalId: sample.terminalId,
        cashierId: sample.cashierId,
        chequeNumber,
        businessDate,
        tableLabel,
        status: 'open',
      },
    });
  });

  await linkOrphanBillableOrdersToOpenCheque(cheque.id, venueId, tableLabel);
  const loaded = await loadCheque(cheque.id);
  await ensureDraftOrder(loaded, {
    venueId,
    terminalId: sample.terminalId,
    cashierId: sample.cashierId,
  });
}

export async function pruneDuplicateOrphanDrafts(venueId) {
  const openParents = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: null },
    select: { tableLabel: true },
  });
  let removed = 0;
  for (const { tableLabel } of openParents) {
    const result = await prisma.order.deleteMany({
      where: {
        venueId,
        tableLabel,
        status: 'draft',
        chequeLink: null,
        items: { none: {} },
      },
    });
    removed += result.count;
  }
  return removed;
}

async function removeEmptyOpenCheque(cheque) {
  if (!canRemoveEmptyCheque(cheque)) return false;
  const locked = await prisma.floorTable.findFirst({
    where: { occupiedByChequeId: cheque.id },
    select: { id: true },
  });
  if (locked) return false;
  const orders = ordersFromCheque(cheque);
  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      await tx.order.delete({ where: { id: order.id } });
    }
    await tx.floorTable.updateMany({
      where: { occupiedByChequeId: cheque.id },
      data: { occupiedByChequeId: null, lockedByTerminalId: null },
    });
    await tx.cheque.delete({ where: { id: cheque.id } });
  });
  return true;
}

async function removeEmptyOpenSplitCheque(cheque) {
  if (!canRemoveEmptySplitCheque(cheque)) return false;
  await prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({
      where: { billingChequeId: cheque.id },
      data: { billingChequeId: null },
    });
    await tx.cheque.delete({ where: { id: cheque.id } });
  });
  return true;
}

function unpaidChildItemIds(child, parent) {
  return billingOrdersFromCheque({ ...child, parentCheque: parent })
    .filter((order) => BILLABLE_ORDER_STATUSES.includes(order.status))
    .flatMap((order) => order.items)
    .filter((item) => itemBelongsToCheque(item, child.id, false) && !item.paidAt)
    .map((item) => item.id);
}

/** Close open split children left behind after their parent was already settled. */
async function closeStaleOpenSplitChild(child, parent) {
  const loadedParent = parent.orders ? parent : await loadCheque(parent.id);
  const loadedChild = child.orders ? child : await loadCheque(child.id);
  const itemIds = unpaidChildItemIds(loadedChild, loadedParent);
  const subtotal = computeChequeSubtotal({ ...loadedChild, parentCheque: loadedParent });

  if (subtotal <= 0 && !loadedChild.splitAmount && !itemIds.length) {
    await prisma.cheque.delete({ where: { id: loadedChild.id } });
    return 'deleted';
  }

  await prisma.$transaction(async (tx) => {
    if (itemIds.length) {
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { paidAt: new Date() },
      });
    }
    await tx.cheque.update({
      where: { id: loadedChild.id },
      data: { status: 'paid', closedAt: new Date() },
    });
  });
  return 'closed';
}

/** Drop empty split shells and close split children whose parent is no longer open. */
export async function repairStaleSplitCheques(venueId) {
  const openChildren = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: { not: null } },
    include: chequeInclude,
  });

  let repaired = 0;
  for (const child of openChildren) {
    const parent = child.parentCheque;
    if (!parent) {
      if (await removeEmptyOpenSplitCheque(child)) repaired += 1;
      continue;
    }

    if (parent.status === 'open') {
      if (await removeEmptyOpenSplitCheque(child)) repaired += 1;
      continue;
    }

    if (['paid', 'voided'].includes(parent.status)) {
      await closeStaleOpenSplitChild(child, parent);
      repaired += 1;
    }
  }
  return repaired;
}

/** Clear floor locks that point at missing or closed cheques. */
export async function releaseStaleFloorLocks(venueId) {
  const floors = await prisma.floorTable.findMany({
    where: { venueId, occupiedByChequeId: { not: null } },
  });
  if (!floors.length) return 0;

  let released = 0;
  for (const floor of floors) {
    const cheque = await prisma.cheque.findUnique({
      where: { id: floor.occupiedByChequeId },
      select: { id: true, status: true, venueId: true },
    });
    const stale = !cheque || cheque.status !== 'open' || cheque.venueId !== venueId;
    if (!stale) continue;
    await prisma.floorTable.update({
      where: { id: floor.id },
      data: { occupiedByChequeId: null, lockedByTerminalId: null },
    });
    released += 1;
  }
  return released;
}

/** Drop duplicate empty open cheques that share the same table label. */
export async function consolidateDuplicateOpenCheques(venueId) {
  const openParents = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: null },
    include: chequeInclude,
    orderBy: { openedAt: 'desc' },
  });

  const groups = new Map();
  for (const cheque of openParents) {
    const key = normalizedTableKey(cheque.tableLabel);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cheque);
  }

  let removed = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => {
      const subDiff = computeChequeSubtotal(b) - computeChequeSubtotal(a);
      if (subDiff !== 0) return subDiff;
      return new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime();
    });
    for (const extra of sorted.slice(1)) {
      if (await removeEmptyOpenCheque(extra)) removed += 1;
    }
  }
  return removed;
}

/** Drop duplicate empty draft rounds linked to cheques. */
export async function pruneEmptyLinkedDraftOrders(venueId) {
  const emptyLinked = await prisma.order.findMany({
    where: {
      venueId,
      status: 'draft',
      items: { none: {} },
      chequeLink: { isNot: null },
    },
    include: {
      chequeLink: {
        include: { cheque: { select: { id: true, status: true } } },
      },
    },
    orderBy: { openedAt: 'asc' },
  });

  let removed = 0;
  const openChequeDrafts = new Map();

  for (const order of emptyLinked) {
    const cheque = order.chequeLink?.cheque;
    if (!cheque) continue;

    if (cheque.status !== 'open') {
      await prisma.order.delete({ where: { id: order.id } });
      removed += 1;
      continue;
    }

    const drafts = openChequeDrafts.get(cheque.id) ?? [];
    drafts.push(order);
    openChequeDrafts.set(cheque.id, drafts);
  }

  for (const drafts of openChequeDrafts.values()) {
    if (drafts.length <= 1) continue;
    for (const extra of drafts.slice(1)) {
      await prisma.order.delete({ where: { id: extra.id } });
      removed += 1;
    }
  }

  return removed;
}

/** Merge duplicate draft rounds on every open parent cheque. */
export async function consolidateOpenChequeDrafts(venueId) {
  const openParents = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: null },
    select: { id: true },
  });

  for (const { id } of openParents) {
    await consolidateChequeDraftOrders(id);
  }
  return openParents.length;
}

/** Remove lingering open parent cheques with no queued or fired items. */
export async function pruneRemovableEmptyOpenCheques(venueId, { minAgeMs = 0 } = {}) {
  const openParents = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: null },
    include: chequeInclude,
  });

  const now = Date.now();
  let removed = 0;
  for (const cheque of openParents) {
    if (minAgeMs > 0 && now - new Date(cheque.openedAt).getTime() < minAgeMs) continue;
    if (await removeEmptyOpenCheque(cheque)) removed += 1;
  }
  return removed;
}

export async function reconcileVenueOpenCheques(venueId, { pruneEmptyParents = false } = {}) {
  await pruneEmptyOrphanDrafts(venueId);
  await pruneEmptyLinkedDraftOrders(venueId);
  await closeOrdersStuckOnPaidCheques(venueId);
  await releaseStaleFloorLocks(venueId);
  await repairStaleSplitCheques(venueId);
  await consolidateDuplicateOpenCheques(venueId);
  if (pruneEmptyParents) {
    await pruneRemovableEmptyOpenCheques(venueId, { minAgeMs: 120_000 });
  }

  const tables = await orphanBillableTables(venueId);
  for (const tableLabel of tables) {
    await ensureOpenChequeForOrphanTable(venueId, tableLabel);
  }

  const openParents = await prisma.cheque.findMany({
    where: { venueId, status: 'open', parentChequeId: null },
    select: { id: true, tableLabel: true },
  });

  let linked = 0;
  for (const cheque of openParents) {
    linked += await linkOrphanBillableOrdersToOpenCheque(cheque.id, venueId, cheque.tableLabel);
    linked += await linkOrphanDraftOrdersToOpenCheque(cheque.id, venueId, cheque.tableLabel);
  }
  await consolidateOpenChequeDrafts(venueId);
  await pruneEmptyLinkedDraftOrders(venueId);
  await pruneDuplicateOrphanDrafts(venueId);
  return { linked, tables: tables.length };
}
