import { prisma } from '../db/prisma.js';
import {
  BILLABLE_ORDER_STATUSES,
  ensureDraftOrder,
  findDraftOrder,
  linkDraftOrder,
  loadCheque,
  nextChequeNumber,
  ordersFromCheque,
} from './cheque-shared.js';

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

  const existing = await prisma.cheque.findFirst({
    where: { venueId, tableLabel, status: 'open', parentChequeId: null },
    select: { id: true },
  });

  if (existing) {
    await linkOrphanBillableOrdersToOpenCheque(existing.id, venueId, tableLabel);
    return;
  }

  const cheque = await prisma.$transaction(async (tx) => {
    const chequeNumber = await nextChequeNumber(tx, venueId);
    return tx.cheque.create({
      data: {
        venueId,
        terminalId: sample.terminalId,
        cashierId: sample.cashierId,
        chequeNumber,
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

export async function reconcileVenueOpenCheques(venueId) {
  await pruneEmptyOrphanDrafts(venueId);
  await closeOrdersStuckOnPaidCheques(venueId);

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
  await pruneDuplicateOrphanDrafts(venueId);
  return { linked, tables: tables.length };
}
