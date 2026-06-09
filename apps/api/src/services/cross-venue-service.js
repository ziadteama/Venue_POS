import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { notFound, validationError, forbidden } from '../utils/errors.js';
import { isBillingAllowed } from './billing-config-service.js';
import { assertManualCardPaymentsAllowed } from './payment-policy.js';
import { requireActiveShift } from './shift-service.js';
import { getPublishedMenuForVenue } from './menu-service.js';
import {
  addOrderItem,
  updateOrderItemQuantity,
  removeOrderItem,
  sendOrderToKitchen,
} from './order-service.js';
import {
  BILLABLE_ORDER_STATUSES,
  chequeInclude,
  computeChequeSubtotal,
  computeChequeTotal,
  findDraftOrder,
  itemLineTotal,
  loadCheque,
  nextChequeNumber,
  ordersFromCheque,
  serializeCheque,
} from './cheque-shared.js';
import { appendAuditLog } from './audit-log-service.js';
import { resolveBusinessDate } from '../utils/business-date.js';
import { appendChequeReceiptItems, serializeOrder } from '../utils/serialize.js';
import { getCheque } from './cheque-lifecycle.js';
import { resolveDiscountAmount } from './cheque-discount.js';

function ensureFeatureEnabled() {
  if (!config.featureCrossVenueBilling) {
    throw forbidden('Cross-venue billing is disabled for this deployment');
  }
}

async function assertAnchorVenue(anchorVenueId) {
  const venue = await prisma.venue.findUnique({
    where: { id: anchorVenueId },
    select: { id: true, type: true, isActive: true },
  });
  if (!venue?.isActive) throw notFound('Venue not found');
  if (venue.type !== 'anchor') {
    throw forbidden('Cross-venue ordering is only available on anchor terminals');
  }
}

async function assertAnchorCashier(anchorVenueId, cashierId) {
  const cashier = await prisma.user.findFirst({
    where: { id: cashierId, venueId: anchorVenueId, role: 'cashier', isActive: true },
  });
  if (!cashier) throw validationError('Invalid cashier for this anchor venue');
  return cashier;
}

async function assertVenueBillingAccess(anchorVenueId, targetVenueId) {
  if (targetVenueId === anchorVenueId) return;
  const allowed = await isBillingAllowed(anchorVenueId, targetVenueId);
  if (!allowed) {
    throw forbidden('This venue is not linked for cross-venue billing');
  }
}

async function assertMenuItemForVenue(menuItemId, venueId) {
  const menuItem = await prisma.menuItem.findFirst({
    where: {
      id: menuItemId,
      isActive: true,
      category: {
        isActive: true,
        menuTemplate: {
          status: 'published',
          isActive: true,
          venues: { some: { venueId } },
        },
      },
    },
  });
  if (!menuItem) {
    throw validationError('Menu item does not belong to this venue');
  }
  return menuItem;
}

async function createCrossVenueDraftOrderInTx(
  tx,
  { venueId, terminalId, cashierId, tableLabel, businessDate = resolveBusinessDate() },
) {
  const last = await tx.order.findFirst({
    where: { venueId, businessDate },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  const orderNumber = (last?.orderNumber ?? 0) + 1;
  return tx.order.create({
    data: {
      venueId,
      terminalId,
      cashierId,
      orderNumber,
      businessDate,
      tableLabel: tableLabel ?? null,
      status: 'draft',
    },
  });
}

async function loadGroupMembers(groupId) {
  const cheques = await prisma.cheque.findMany({
    where: { crossVenueGroupId: groupId },
    include: {
      ...chequeInclude,
      venue: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          taxRate: true,
          taxInclusive: true,
          serviceRate: true,
          serviceEnabled: true,
        },
      },
    },
    orderBy: { venueId: 'asc' },
  });
  return cheques;
}

function draftSubtotal(draftOrder) {
  if (!draftOrder?.items?.length) return 0;
  return Number(
    draftOrder.items.reduce((sum, item) => sum + itemLineTotal(item), 0).toFixed(2),
  );
}

function hasSentOrders(cheque) {
  return ordersFromCheque(cheque).some((o) => BILLABLE_ORDER_STATUSES.includes(o.status));
}

export function serializeCrossVenueGroup(groupId, anchorVenueId, members) {
  const cheques = members.map((member) => {
    const serialized = serializeCheque(member);
    const draft = findDraftOrder(member);
    const draftOrder = draft ? serializeOrder(draft) : null;
    const firedSubtotal = computeChequeTotal(member);
    const pendingSubtotal = draftSubtotal(draftOrder);
    return {
      ...serialized,
      venueNameEn: member.venue?.nameEn ?? null,
      venueNameAr: member.venue?.nameAr ?? null,
      draftOrder,
      firedSubtotal,
      pendingSubtotal,
      displaySubtotal: Number((firedSubtotal + pendingSubtotal).toFixed(2)),
    };
  });

  const combinedTotal = Number(
    cheques.reduce((sum, c) => sum + c.firedSubtotal, 0).toFixed(2),
  );
  const pendingTotal = Number(
    cheques.reduce((sum, c) => sum + c.pendingSubtotal, 0).toFixed(2),
  );
  const displayTotal = Number((combinedTotal + pendingTotal).toFixed(2));
  const status = members.every((m) => m.status === 'paid') ? 'paid' : 'open';
  const tableLabel = members[0]?.tableLabel ?? null;

  const venueMap = new Map();
  for (const cheque of cheques) {
    const existing = venueMap.get(cheque.venueId);
    if (!existing) {
      venueMap.set(cheque.venueId, {
        venueId: cheque.venueId,
        nameEn: cheque.venueNameEn,
        nameAr: cheque.venueNameAr,
        chequeId: cheque.id,
        draftOrder: cheque.draftOrder,
        firedSubtotal: cheque.firedSubtotal,
        pendingSubtotal: cheque.pendingSubtotal,
        displaySubtotal: cheque.displaySubtotal,
      });
    }
  }

  const anchorMember = members.find((m) => m.venueId === anchorVenueId) ?? members[0];
  const latestDiscountAudit = anchorMember?.discountAudits?.[0];
  const groupDiscountPercent =
    latestDiscountAudit?.percent != null ? Number(latestDiscountAudit.percent) : null;
  const groupDiscountTotal = Number(
    cheques.reduce((sum, c) => sum + Number(c.discountAmount ?? 0), 0).toFixed(2),
  );

  return {
    groupId,
    anchorVenueId,
    status,
    tableLabel,
    combinedTotal,
    pendingTotal,
    displayTotal,
    groupDiscountPercent,
    groupDiscountTotal,
    cheques,
    venues: [...venueMap.values()],
  };
}

/** Linked cheques in a cross-venue settlement group (hub read-only). */
export async function getCrossVenueGroupSummary(groupId) {
  if (!groupId) return null;
  const members = await loadGroupMembers(groupId);
  if (!members.length) return null;
  return {
    groupId,
    members: members.map((m) => {
      const serialized = serializeCheque(m);
      return {
        id: serialized.id,
        chequeNumber: serialized.chequeNumber,
        venueId: serialized.venueId,
        venueNameEn: m.venue?.nameEn ?? null,
        venueNameAr: m.venue?.nameAr ?? null,
        tableLabel: serialized.tableLabel,
        status: serialized.status,
        total: serialized.total,
      };
    }),
  };
}

export async function getCrossVenueGroupByAnchorCheque(anchorChequeId, anchorVenueId) {
  ensureFeatureEnabled();
  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (!anchorCheque.crossVenueGroupId) return null;
  return getCrossVenueGroup(anchorCheque.crossVenueGroupId, anchorVenueId);
}

/**
 * Lazy attach: add an item to the anchor's open cheque. Target-venue items stamp
 * crossVenueGroupId on the existing cheque and create sibling venue cheques.
 */
export async function addCrossVenueItemByCheque({
  anchorChequeId,
  venueId,
  anchorVenueId,
  anchorTerminalId,
  cashierId,
  menuItemId,
  quantity = 1,
  modifiers = [],
}) {
  ensureFeatureEnabled();
  await assertAnchorVenue(anchorVenueId);
  await assertAnchorCashier(anchorVenueId, cashierId);
  await assertMenuItemForVenue(menuItemId, venueId);

  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (anchorCheque.status !== 'open') throw validationError('Cheque is not open');

  if (venueId === anchorVenueId) {
    const draft = findDraftOrder(anchorCheque);
    if (!draft) throw validationError('No draft order on this cheque');
    await addOrderItem(draft.id, { menuItemId, quantity, modifiers });
    const updatedAnchor = await loadCheque(anchorChequeId);
    const group = anchorCheque.crossVenueGroupId
      ? await getCrossVenueGroup(anchorCheque.crossVenueGroupId, anchorVenueId)
      : null;
    return { cheque: serializeCheque(updatedAnchor), group };
  }

  let groupId = anchorCheque.crossVenueGroupId;
  if (!groupId) {
    groupId = randomUUID();
    await prisma.cheque.update({
      where: { id: anchorChequeId },
      data: { crossVenueGroupId: groupId, isCrossVenue: true },
    });
    await appendAuditLog({
      venueId: anchorVenueId,
      actorId: cashierId,
      action: 'cross_venue_order_attach',
      entityType: 'cross_venue_group',
      entityId: groupId,
      summary: `Attached cheque #${anchorCheque.chequeNumber} to cross-venue group`,
      details: { anchorChequeId, anchorTerminalId },
    });
  }

  await ensureVenueChequeInGroup({
    groupId,
    targetVenueId: venueId,
    anchorVenueId,
    anchorTerminalId,
    cashierId,
    tableLabel: anchorCheque.tableLabel,
  });

  const { draft } = await resolveDraftForVenue(groupId, venueId);
  await addOrderItem(draft.id, { menuItemId, quantity, modifiers });

  const updatedAnchor = await loadCheque(anchorChequeId);
  const group = await getCrossVenueGroup(groupId, anchorVenueId);
  return { cheque: serializeCheque(updatedAnchor), group };
}

export async function editCrossVenueItemByCheque({
  anchorChequeId,
  venueId,
  anchorVenueId,
  itemId,
  quantity,
}) {
  ensureFeatureEnabled();
  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (!anchorCheque.crossVenueGroupId) {
    throw validationError('Cheque is not part of a cross-venue group');
  }
  const group = await editCrossVenueItem({
    groupId: anchorCheque.crossVenueGroupId,
    venueId,
    anchorVenueId,
    itemId,
    quantity,
  });
  const updatedAnchor = await loadCheque(anchorChequeId);
  return { cheque: serializeCheque(updatedAnchor), group };
}

export async function removeCrossVenueItemByCheque({
  anchorChequeId,
  venueId,
  anchorVenueId,
  itemId,
}) {
  ensureFeatureEnabled();
  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (!anchorCheque.crossVenueGroupId) {
    throw validationError('Cheque is not part of a cross-venue group');
  }
  const group = await removeCrossVenueItem({
    groupId: anchorCheque.crossVenueGroupId,
    venueId,
    anchorVenueId,
    itemId,
  });
  const updatedAnchor = await loadCheque(anchorChequeId);
  return { cheque: serializeCheque(updatedAnchor), group };
}

/** Clear draft rounds on every open cheque in the group. */
export async function clearCrossVenueGroupDrafts(anchorChequeId, anchorVenueId) {
  ensureFeatureEnabled();
  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (!anchorCheque.crossVenueGroupId) return null;

  const members = await loadGroupMembers(anchorCheque.crossVenueGroupId);
  await prisma.$transaction(async (tx) => {
    for (const member of members) {
      const draft = findDraftOrder(member);
      if (!draft?.items?.length) continue;
      await tx.orderItem.deleteMany({ where: { orderId: draft.id } });
    }
  });

  const group = await getCrossVenueGroup(anchorCheque.crossVenueGroupId, anchorVenueId);
  const updatedAnchor = await loadCheque(anchorChequeId);
  return { cheque: serializeCheque(updatedAnchor), group };
}

export async function fireCrossVenueGroupByCheque({
  anchorChequeId,
  anchorVenueId,
  anchorTerminalId,
  cashierId,
}) {
  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (!anchorCheque.crossVenueGroupId) return null;
  return fireCrossVenueGroup({
    groupId: anchorCheque.crossVenueGroupId,
    anchorVenueId,
    anchorTerminalId,
    cashierId,
  });
}

export async function getCrossVenueMenu(anchorVenueId, targetVenueId) {
  ensureFeatureEnabled();
  await assertAnchorVenue(anchorVenueId);
  await assertVenueBillingAccess(anchorVenueId, targetVenueId);
  return getPublishedMenuForVenue(targetVenueId);
}

export async function startCrossVenueOrder({
  anchorVenueId,
  anchorTerminalId,
  cashierId,
  tableLabel,
}) {
  ensureFeatureEnabled();
  await assertAnchorVenue(anchorVenueId);
  await assertAnchorCashier(anchorVenueId, cashierId);

  const groupId = randomUUID();

  const businessDate = resolveBusinessDate();
  await prisma.$transaction(async (tx) => {
    const chequeNumber = await nextChequeNumber(tx, anchorVenueId, businessDate);
    const cheque = await tx.cheque.create({
      data: {
        venueId: anchorVenueId,
        terminalId: anchorTerminalId,
        cashierId,
        chequeNumber,
        businessDate,
        tableLabel: tableLabel ?? null,
        status: 'open',
        crossVenueGroupId: groupId,
        isCrossVenue: true,
      },
    });
    const order = await createCrossVenueDraftOrderInTx(tx, {
      venueId: anchorVenueId,
      terminalId: anchorTerminalId,
      cashierId,
      tableLabel,
      businessDate,
    });
    await tx.chequeOrder.create({ data: { chequeId: cheque.id, orderId: order.id } });
  });

  await appendAuditLog({
    venueId: anchorVenueId,
    actorId: cashierId,
    action: 'cross_venue_order_start',
    entityType: 'cross_venue_group',
    entityId: groupId,
    summary: `Started cross-venue order${tableLabel ? ` for table ${tableLabel}` : ''}`,
    details: { anchorTerminalId, tableLabel },
  });

  const members = await loadGroupMembers(groupId);
  return serializeCrossVenueGroup(groupId, anchorVenueId, members);
}

export async function ensureVenueChequeInGroup({
  groupId,
  targetVenueId,
  anchorVenueId,
  anchorTerminalId,
  cashierId,
  tableLabel,
}) {
  ensureFeatureEnabled();
  await assertAnchorCashier(anchorVenueId, cashierId);
  await assertVenueBillingAccess(anchorVenueId, targetVenueId);

  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue order not found');

  const existing = members.find((m) => m.venueId === targetVenueId && m.status === 'open');
  if (existing) return existing;

  const label = tableLabel ?? members[0]?.tableLabel ?? null;

  const anchorBusinessDate = members[0]?.businessDate ?? resolveBusinessDate();
  const cheque = await prisma.$transaction(async (tx) => {
    const chequeNumber = await nextChequeNumber(tx, targetVenueId, anchorBusinessDate);
    const created = await tx.cheque.create({
      data: {
        venueId: targetVenueId,
        terminalId: anchorTerminalId,
        cashierId,
        chequeNumber,
        businessDate: anchorBusinessDate,
        tableLabel: label,
        status: 'open',
        crossVenueGroupId: groupId,
        isCrossVenue: true,
      },
    });
    const order = await createCrossVenueDraftOrderInTx(tx, {
      venueId: targetVenueId,
      terminalId: anchorTerminalId,
      cashierId,
      tableLabel: label,
      businessDate: anchorBusinessDate,
    });
    await tx.chequeOrder.create({ data: { chequeId: created.id, orderId: order.id } });
    return created;
  });

  return prisma.cheque.findUnique({
    where: { id: cheque.id },
    include: {
      ...chequeInclude,
      venue: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          taxRate: true,
          taxInclusive: true,
          serviceRate: true,
          serviceEnabled: true,
        },
      },
    },
  });
}

async function resolveDraftForVenue(groupId, venueId) {
  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue order not found');

  const member = members.find((m) => m.venueId === venueId);
  if (!member) throw notFound('No cheque for this venue in the group');

  const draft = findDraftOrder(member);
  if (!draft) throw validationError('No draft order on this venue cheque');
  return { members, member, draft };
}

export async function addCrossVenueItem({
  groupId,
  venueId,
  anchorVenueId,
  anchorTerminalId,
  cashierId,
  menuItemId,
  quantity = 1,
  modifiers = [],
}) {
  ensureFeatureEnabled();
  await assertAnchorCashier(anchorVenueId, cashierId);
  await assertMenuItemForVenue(menuItemId, venueId);

  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue order not found');
  const tableLabel = members[0]?.tableLabel ?? null;

  await ensureVenueChequeInGroup({
    groupId,
    targetVenueId: venueId,
    anchorVenueId,
    anchorTerminalId,
    cashierId,
    tableLabel,
  });

  const { draft } = await resolveDraftForVenue(groupId, venueId);
  await addOrderItem(draft.id, { menuItemId, quantity, modifiers });

  const updatedMembers = await loadGroupMembers(groupId);
  return serializeCrossVenueGroup(groupId, anchorVenueId, updatedMembers);
}

export async function editCrossVenueItem({ groupId, venueId, anchorVenueId, itemId, quantity }) {
  ensureFeatureEnabled();
  const { draft } = await resolveDraftForVenue(groupId, venueId);
  const item = draft.items.find((row) => row.id === itemId);
  if (!item) throw notFound('Order item not found');

  await updateOrderItemQuantity(draft.id, itemId, quantity);
  const updatedMembers = await loadGroupMembers(groupId);
  return serializeCrossVenueGroup(groupId, anchorVenueId, updatedMembers);
}

export async function removeCrossVenueItem({ groupId, venueId, anchorVenueId, itemId }) {
  ensureFeatureEnabled();
  const { draft } = await resolveDraftForVenue(groupId, venueId);
  const item = draft.items.find((row) => row.id === itemId);
  if (!item) throw notFound('Order item not found');

  await removeOrderItem(draft.id, itemId);
  const updatedMembers = await loadGroupMembers(groupId);
  return serializeCrossVenueGroup(groupId, anchorVenueId, updatedMembers);
}

export async function fireCrossVenueGroup({
  groupId,
  anchorVenueId,
  anchorTerminalId,
  cashierId,
  venueId,
}) {
  ensureFeatureEnabled();
  await assertAnchorCashier(anchorVenueId, cashierId);

  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue order not found');

  const targets = venueId
    ? members.filter((m) => m.venueId === venueId)
    : members;

  const sentOrders = [];
  for (const member of targets) {
    const draft = findDraftOrder(member);
    if (!draft?.items?.length) continue;

    const sentOrder = await sendOrderToKitchen(draft.id);
    sentOrders.push(sentOrder);

    const nextDraft = await prisma.$transaction(async (tx) => {
      const created = await createCrossVenueDraftOrderInTx(tx, {
        venueId: member.venueId,
        terminalId: anchorTerminalId,
        cashierId,
        tableLabel: member.tableLabel,
      });
      await tx.chequeOrder.create({ data: { chequeId: member.id, orderId: created.id } });
      return created;
    });
    void nextDraft;
  }

  if (!sentOrders.length) {
    throw validationError('No draft items to send to the kitchen');
  }

  const updatedMembers = await loadGroupMembers(groupId);
  return {
    sentOrders,
    group: serializeCrossVenueGroup(groupId, anchorVenueId, updatedMembers),
  };
}

export async function getCrossVenueGroup(groupId, anchorVenueId) {
  ensureFeatureEnabled();
  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue order not found');
  return serializeCrossVenueGroup(groupId, anchorVenueId, members);
}

/** Cancel an unpaid cross-venue order — deletes empty cheques and draft rounds. */
export async function cancelCrossVenueGroup(groupId, anchorVenueId, { cashierId } = {}) {
  ensureFeatureEnabled();
  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue order not found');

  if (members.some((m) => m.status === 'paid')) {
    throw validationError('Settlement already has paid cheques and cannot be cancelled');
  }
  if (members.some((m) => hasSentOrders(m))) {
    throw validationError('Cannot cancel — orders already sent to the kitchen');
  }

  await prisma.$transaction(async (tx) => {
    for (const member of members) {
      const orders = ordersFromCheque(member);
      for (const order of orders) {
        await tx.orderItem.deleteMany({ where: { orderId: order.id } });
        await tx.chequeOrder.deleteMany({ where: { orderId: order.id } });
        await tx.order.delete({ where: { id: order.id } });
      }
      await tx.cheque.delete({ where: { id: member.id } });
    }
  });

  await appendAuditLog({
    venueId: anchorVenueId,
    actorId: cashierId ?? null,
    action: 'cross_venue_order_cancel',
    entityType: 'cross_venue_group',
    entityId: groupId,
    summary: `Cancelled cross-venue order (${members.length} cheque(s))`,
    details: { chequeIds: members.map((m) => m.id) },
  });

  return { groupId, cancelled: true };
}

function assertGroupDiscountAllowed(members) {
  if (!config.featureDiscountsEnabled) {
    throw validationError('Discounts are not enabled for this venue');
  }
  for (const member of members) {
    if (member.status !== 'open') {
      throw validationError('Discounts apply only to open cheques');
    }
    const draft = findDraftOrder(member);
    if (draft?.items?.length) {
      throw validationError('Send or clear the current round before applying a discount');
    }
  }
}

function groupDiscountAuditData({
  chequeId,
  cashierId,
  initiatorId,
  approverId,
  action,
  amount,
  previousAmount = null,
  percent = null,
  reason,
}) {
  return {
    chequeId,
    cashierId,
    initiatorId,
    approverId,
    action,
    amount,
    previousAmount,
    percent,
    reason: reason.trim(),
  };
}

function membersWithDiscountableSubtotal(members) {
  return members.filter((member) => computeChequeSubtotal(member) > 0);
}

/** Split customer tender lines proportionally by each venue's share of combinedTotal. */
export function allocateProportionalPayments(paymentLines, memberTotals) {
  const combined = Number(memberTotals.reduce((sum, m) => sum + m.total, 0).toFixed(2));
  if (combined <= 0) {
    return memberTotals.map(({ member }) => ({ member, payments: [] }));
  }

  const methods = [...new Set(paymentLines.map((l) => l.method))];
  const methodAmounts = Object.fromEntries(
    methods.map((method) => [
      method,
      Number(
        paymentLines
          .filter((l) => l.method === method)
          .reduce((sum, l) => sum + Number(l.amount), 0)
          .toFixed(2),
      ),
    ]),
  );
  const allocatedByMethod = Object.fromEntries(methods.map((m) => [m, 0]));

  return memberTotals.map(({ member, total }, index) => {
    const isLast = index === memberTotals.length - 1;
    const owed = Number(total.toFixed(2));
    const payments = [];

    if (isLast) {
      for (const method of methods) {
        const amt = Number((methodAmounts[method] - allocatedByMethod[method]).toFixed(2));
        if (amt > 0) {
          const line = paymentLines.find((l) => l.method === method);
          payments.push({
            method,
            amount: amt,
            cardLast4: method === 'card' ? (line?.cardLast4 ?? null) : null,
          });
        }
      }
    } else {
      const weight = owed / combined;
      for (const method of methods) {
        const amt = Number((methodAmounts[method] * weight).toFixed(2));
        allocatedByMethod[method] += amt;
        if (amt > 0) {
          const line = paymentLines.find((l) => l.method === method);
          payments.push({
            method,
            amount: amt,
            cardLast4: method === 'card' ? (line?.cardLast4 ?? null) : null,
          });
        }
      }
    }

    return { member, payments };
  });
}

export async function applyCrossVenueGroupDiscount({
  anchorChequeId,
  anchorVenueId,
  percent,
  reason,
  initiatorId,
  approverId,
  cashierId,
}) {
  ensureFeatureEnabled();
  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (!anchorCheque.crossVenueGroupId) {
    throw validationError('Cheque is not part of a cross-venue group');
  }
  if (percent == null) throw validationError('Cross-venue discounts must use percent only');

  const members = await loadGroupMembers(anchorCheque.crossVenueGroupId);
  assertGroupDiscountAllowed(members);
  if (members.some((m) => Number(m.discountAmount ?? 0) > 0)) {
    throw validationError('Discount already applied — edit or remove it first');
  }

  const targets = membersWithDiscountableSubtotal(members);
  if (!targets.length) throw validationError('Nothing to discount on this group');

  const resolvedCashierId = cashierId ?? anchorCheque.cashierId;

  await prisma.$transaction(async (tx) => {
    for (const member of targets) {
      const { discountAmount, percent: pct } = resolveDiscountAmount(member, { percent });
      await tx.chequeDiscountAudit.create({
        data: groupDiscountAuditData({
          chequeId: member.id,
          cashierId: resolvedCashierId,
          initiatorId,
          approverId,
          action: 'apply',
          amount: discountAmount,
          percent: pct,
          reason,
        }),
      });
      await tx.cheque.update({
        where: { id: member.id },
        data: { discountAmount },
      });
    }
  });

  return getCheque(anchorChequeId, anchorVenueId);
}

export async function updateCrossVenueGroupDiscount({
  anchorChequeId,
  anchorVenueId,
  percent,
  reason,
  initiatorId,
  approverId,
  cashierId,
}) {
  ensureFeatureEnabled();
  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (!anchorCheque.crossVenueGroupId) {
    throw validationError('Cheque is not part of a cross-venue group');
  }
  if (percent == null) throw validationError('Cross-venue discounts must use percent only');

  const members = await loadGroupMembers(anchorCheque.crossVenueGroupId);
  assertGroupDiscountAllowed(members);
  if (!members.some((m) => Number(m.discountAmount ?? 0) > 0)) {
    throw validationError('No discount on this cheque');
  }

  const targets = membersWithDiscountableSubtotal(members);
  const resolvedCashierId = cashierId ?? anchorCheque.cashierId;

  await prisma.$transaction(async (tx) => {
    for (const member of targets) {
      const previousAmount = Number(member.discountAmount ?? 0);
      const { discountAmount, percent: pct } = resolveDiscountAmount(member, { percent });
      await tx.chequeDiscountAudit.create({
        data: groupDiscountAuditData({
          chequeId: member.id,
          cashierId: resolvedCashierId,
          initiatorId,
          approverId,
          action: 'change',
          amount: discountAmount,
          previousAmount,
          percent: pct,
          reason,
        }),
      });
      await tx.cheque.update({
        where: { id: member.id },
        data: { discountAmount },
      });
    }
    for (const member of members.filter((m) => !targets.some((t) => t.id === m.id))) {
      if (Number(member.discountAmount ?? 0) > 0) {
        await tx.cheque.update({
          where: { id: member.id },
          data: { discountAmount: 0 },
        });
      }
    }
  });

  return getCheque(anchorChequeId, anchorVenueId);
}

export async function removeCrossVenueGroupDiscount({
  anchorChequeId,
  anchorVenueId,
  reason,
  initiatorId,
  approverId,
  cashierId,
}) {
  ensureFeatureEnabled();
  const anchorCheque = await loadCheque(anchorChequeId);
  if (anchorCheque.venueId !== anchorVenueId) {
    throw validationError('Cheque not found for this terminal');
  }
  if (!anchorCheque.crossVenueGroupId) {
    throw validationError('Cheque is not part of a cross-venue group');
  }

  const members = await loadGroupMembers(anchorCheque.crossVenueGroupId);
  assertGroupDiscountAllowed(members);
  const withDiscount = members.filter((m) => Number(m.discountAmount ?? 0) > 0);
  if (!withDiscount.length) throw validationError('No discount on this cheque');

  const resolvedCashierId = cashierId ?? anchorCheque.cashierId;

  await prisma.$transaction(async (tx) => {
    for (const member of withDiscount) {
      const removedAmount = Number(member.discountAmount);
      await tx.chequeDiscountAudit.create({
        data: groupDiscountAuditData({
          chequeId: member.id,
          cashierId: resolvedCashierId,
          initiatorId,
          approverId,
          action: 'remove',
          amount: removedAmount,
          previousAmount: removedAmount,
          reason,
        }),
      });
      await tx.cheque.update({
        where: { id: member.id },
        data: { discountAmount: 0 },
      });
    }
  });

  return getCheque(anchorChequeId, anchorVenueId);
}

function buildCrossVenueReceipt(members, { tendered, change, paymentLines = [] }) {
  const lines = ['CROSS-VENUE SETTLEMENT', '==='];
  let grand = 0;
  for (const member of members) {
    const serialized = serializeCheque(member);
    const total = serialized.total;
    grand += total;
    lines.push(`${member.venue?.nameEn ?? 'Venue'} — Cheque #${serialized.chequeNumber}`);
    lines.push(`Table: ${serialized.tableLabel ?? '—'}`);
    lines.push('---');
    appendChequeReceiptItems(lines, serialized);
    lines.push(`Venue total: ${total.toFixed(2)}`);
    lines.push('');
  }
  lines.push('---', `GRAND TOTAL: ${grand.toFixed(2)}`);
  if (paymentLines.length) {
    const byMethod = paymentLines.reduce((acc, line) => {
      acc[line.method] = (acc[line.method] ?? 0) + Number(line.amount);
      return acc;
    }, {});
    for (const [method, amount] of Object.entries(byMethod)) {
      const label = method.charAt(0).toUpperCase() + method.slice(1);
      lines.push(`${label}: ${Number(amount).toFixed(2)}`);
    }
  }
  if (tendered != null) lines.push(`Tendered: ${Number(tendered).toFixed(2)}`);
  if (change != null) lines.push(`Change: ${Number(change).toFixed(2)}`);
  return lines.join('\n');
}

/**
 * Settle every cheque in the group with a single tender. Each cheque is paid
 * in its OWN venue (a Payment row per member), so existing revenue/EOD/analytics
 * queries (which aggregate by cheque.venueId) attribute money to the venue that
 * earned it. Kitchen routing is untouched — orders were fired by their own venue.
 */
export async function payCrossVenueGroup({
  groupId,
  anchorVenueId,
  anchorTerminalId,
  cashierId,
  payments,
  method = 'cash',
  cardLast4,
  tendered,
  managerPin,
}) {
  ensureFeatureEnabled();
  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue order not found');

  const openMembers = members.filter((m) => m.status === 'open');
  if (!openMembers.length) throw validationError('Settlement is already paid');

  for (const member of openMembers) {
    const draft = findDraftOrder(member);
    if (draft?.items?.length) {
      throw validationError('Send all items to the kitchen before paying');
    }
  }

  const memberTotals = openMembers.map((member) => ({
    member,
    total: computeChequeTotal(member),
  }));
  const combinedTotal = Number(
    memberTotals.reduce((sum, m) => sum + m.total, 0).toFixed(2),
  );
  if (combinedTotal <= 0) throw validationError('Nothing to settle');

  const paymentLines =
    payments?.length > 0
      ? payments
      : [{ method: method ?? 'cash', amount: combinedTotal, cardLast4: cardLast4 ?? null }];

  for (const line of paymentLines) {
    if (line.cardLast4 && line.method !== 'card') {
      throw validationError('Card last-4 is only valid for card payments');
    }
    if (line.cardLast4 && !/^\d{4}$/.test(line.cardLast4)) {
      throw validationError('Card last-4 must be exactly 4 digits');
    }
  }

  const paySum = Number(paymentLines.reduce((s, p) => s + Number(p.amount), 0).toFixed(2));
  if (Math.abs(paySum - combinedTotal) > 0.009) {
    throw validationError('Payment total must match cheque total');
  }

  await assertManualCardPaymentsAllowed(paymentLines, {
    manualCardEnabled: config.featureManualCardEnabled,
    approvalThreshold: config.manualCardApprovalThreshold,
    managerPin,
    venueId: anchorVenueId,
  });

  const cashTotal = paymentLines
    .filter((p) => p.method === 'cash')
    .reduce((s, p) => s + Number(p.amount), 0);

  let change = null;
  if (tendered != null) {
    if (cashTotal > 0 && tendered < cashTotal) {
      throw validationError('Tendered amount is less than cash due');
    }
    change = Number((tendered - cashTotal).toFixed(2));
  }

  const activeShift = anchorTerminalId
    ? await requireActiveShift(cashierId, anchorTerminalId, anchorVenueId)
    : null;

  const allocated = allocateProportionalPayments(paymentLines, memberTotals);

  await prisma.$transaction(async (tx) => {
    for (const { member, payments: memberPayments } of allocated) {
      for (const line of memberPayments) {
        await tx.payment.create({
          data: {
            chequeId: member.id,
            cashierId,
            shiftId: activeShift?.id ?? null,
            method: line.method,
            amount: line.amount,
            cardLast4: line.method === 'card' ? (line.cardLast4 ?? null) : null,
          },
        });
      }

      const billableOrders = ordersFromCheque(member).filter((o) =>
        BILLABLE_ORDER_STATUSES.includes(o.status),
      );
      const itemIds = billableOrders
        .flatMap((o) => o.items)
        .filter((i) => !i.paidAt)
        .map((i) => i.id);
      if (itemIds.length) {
        await tx.orderItem.updateMany({
          where: { id: { in: itemIds } },
          data: { paidAt: new Date() },
        });
      }

      const orderIds = billableOrders.map((o) => o.id);
      if (orderIds.length) {
        await tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: { status: 'closed', closedAt: new Date() },
        });
      }

      const draft = findDraftOrder(member);
      if (draft && !draft.items.length) {
        await tx.orderItem.deleteMany({ where: { orderId: draft.id } });
        await tx.chequeOrder.deleteMany({ where: { orderId: draft.id } });
        await tx.order.delete({ where: { id: draft.id } });
      }

      await tx.cheque.update({
        where: { id: member.id },
        data: { status: 'paid', closedAt: new Date() },
      });
    }
  });

  const paidMembers = await loadGroupMembers(groupId);
  const receipt = buildCrossVenueReceipt(paidMembers, { tendered, change, paymentLines });

  await appendAuditLog({
    venueId: anchorVenueId,
    actorId: cashierId,
    action: 'cross_venue_pay',
    entityType: 'cross_venue_group',
    entityId: groupId,
    summary: `Cross-venue settlement paid: ${combinedTotal.toFixed(2)} across ${openMembers.length} venue(s)`,
    details: {
      payments: paymentLines,
      combinedTotal,
      members: memberTotals.map((m) => ({
        chequeId: m.member.id,
        venueId: m.member.venueId,
        total: m.total,
      })),
    },
  });

  return {
    group: serializeCrossVenueGroup(groupId, anchorVenueId, paidMembers),
    receipt,
    change,
    combinedTotal,
  };
}
