import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { notFound, validationError, forbidden, conflict } from '../utils/errors.js';
import { isBillingAllowed, getEnabledTargets } from './billing-config-service.js';
import { assertManualCardPaymentsAllowed } from './payment-policy.js';
import { requireActiveShift } from './shift-service.js';
import {
  BILLABLE_ORDER_STATUSES,
  chequeInclude,
  computeChequeTotal,
  findDraftOrder,
  ordersFromCheque,
  serializeCheque,
} from './cheque-shared.js';
import { appendAuditLog } from './audit-log-service.js';

function ensureFeatureEnabled() {
  if (!config.featureCrossVenueBilling) {
    throw forbidden('Cross-venue billing is disabled for this deployment');
  }
}

function chequeSummary(cheque) {
  const serialized = serializeCheque(cheque);
  return {
    id: serialized.id,
    venueId: serialized.venueId,
    chequeNumber: serialized.chequeNumber,
    tableLabel: serialized.tableLabel,
    status: serialized.status,
    total: serialized.total,
    crossVenueGroupId: cheque.crossVenueGroupId ?? null,
  };
}

/**
 * Open, settle-ready cheques the anchor terminal may pull onto a cross-venue
 * settlement, grouped by their originating venue. Each cheque keeps its own
 * venueId so revenue and kitchen routing stay attributed to that venue.
 */
export async function listCrossVenueBillableCheques(anchorVenueId) {
  ensureFeatureEnabled();
  const targets = await getEnabledTargets(anchorVenueId);
  if (!targets.length) return { venues: [] };

  const venueIds = targets.map((v) => v.id);
  const cheques = await prisma.cheque.findMany({
    where: {
      venueId: { in: venueIds },
      status: 'open',
      parentChequeId: null,
      crossVenueGroupId: null,
    },
    include: chequeInclude,
    orderBy: { openedAt: 'asc' },
  });

  const byVenue = new Map(targets.map((v) => [v.id, { venue: v, cheques: [] }]));
  for (const cheque of cheques) {
    const total = computeChequeTotal(cheque);
    if (total <= 0) continue; // nothing fired yet — skip empty tables
    byVenue.get(cheque.venueId)?.cheques.push(chequeSummary(cheque));
  }

  return {
    venues: [...byVenue.values()]
      .filter((entry) => entry.cheques.length > 0)
      .map((entry) => ({
        venueId: entry.venue.id,
        nameEn: entry.venue.nameEn,
        nameAr: entry.venue.nameAr,
        cheques: entry.cheques,
      })),
  };
}

async function loadGroupMembers(groupId) {
  const cheques = await prisma.cheque.findMany({
    where: { crossVenueGroupId: groupId },
    include: chequeInclude,
    orderBy: { venueId: 'asc' },
  });
  return cheques;
}

function serializeGroup(groupId, anchorVenueId, members) {
  const cheques = members.map((m) => {
    const serialized = serializeCheque(m);
    return { ...serialized, venueNameEn: m.venue?.nameEn ?? null };
  });
  const combinedTotal = Number(
    cheques.reduce((sum, c) => sum + c.total, 0).toFixed(2),
  );
  const status = members.every((m) => m.status === 'paid') ? 'paid' : 'open';
  return {
    groupId,
    anchorVenueId,
    status,
    combinedTotal,
    cheques,
  };
}

/**
 * Reserve the selected open cheques onto a new cross-venue settlement group.
 * The group id acts as a durable lock: a cheque can only belong to one group,
 * and the conditional update guards against two anchor terminals grabbing the
 * same cheque at once.
 */
export async function createCrossVenueGroup({
  anchorVenueId,
  anchorTerminalId,
  cashierId,
  chequeIds,
}) {
  ensureFeatureEnabled();
  if (!Array.isArray(chequeIds) || chequeIds.length === 0) {
    throw validationError('Select at least one cheque to combine');
  }
  const uniqueIds = [...new Set(chequeIds)];

  const cheques = await prisma.cheque.findMany({
    where: { id: { in: uniqueIds } },
    include: chequeInclude,
  });
  if (cheques.length !== uniqueIds.length) {
    throw notFound('One or more cheques were not found');
  }

  for (const cheque of cheques) {
    if (cheque.status !== 'open') {
      throw validationError(`Cheque #${cheque.chequeNumber} is not open`);
    }
    if (cheque.parentChequeId) {
      throw validationError('Split sub-cheques cannot be cross-billed');
    }
    if (cheque.crossVenueGroupId) {
      throw conflict('Cheque is already part of another cross-venue settlement');
    }
    const allowed = await isBillingAllowed(anchorVenueId, cheque.venueId);
    if (!allowed) {
      throw forbidden('This venue is not linked for cross-venue billing');
    }
    const draft = findDraftOrder(cheque);
    if (draft?.items?.length) {
      throw validationError(
        `Send or clear the open round on cheque #${cheque.chequeNumber} before combining`,
      );
    }
    if (computeChequeTotal(cheque) <= 0) {
      throw validationError(`Cheque #${cheque.chequeNumber} has nothing to settle`);
    }
  }

  const groupId = randomUUID();
  const reserved = await prisma.cheque.updateMany({
    where: {
      id: { in: uniqueIds },
      status: 'open',
      parentChequeId: null,
      crossVenueGroupId: null,
    },
    data: { crossVenueGroupId: groupId, isCrossVenue: true },
  });
  if (reserved.count !== uniqueIds.length) {
    // A concurrent settlement grabbed one of these cheques first.
    throw conflict('One or more cheques were just locked by another terminal');
  }

  await appendAuditLog({
    venueId: anchorVenueId,
    actorId: cashierId,
    action: 'cross_venue_lock',
    entityType: 'cross_venue_group',
    entityId: groupId,
    summary: `Locked ${uniqueIds.length} cheque(s) for cross-venue settlement`,
    details: { chequeIds: uniqueIds, anchorTerminalId },
  });

  const members = await loadGroupMembers(groupId);
  return serializeGroup(groupId, anchorVenueId, members);
}

export async function getCrossVenueGroup(groupId, anchorVenueId) {
  ensureFeatureEnabled();
  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue settlement not found');
  return serializeGroup(groupId, anchorVenueId, members);
}

/** Release a settlement that was not paid — clears the lock on open members. */
export async function cancelCrossVenueGroup(groupId, anchorVenueId, { cashierId } = {}) {
  ensureFeatureEnabled();
  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue settlement not found');
  if (members.some((m) => m.status === 'paid')) {
    throw validationError('Settlement already has paid cheques and cannot be cancelled');
  }

  await prisma.cheque.updateMany({
    where: { crossVenueGroupId: groupId, status: 'open' },
    data: { crossVenueGroupId: null, isCrossVenue: false },
  });

  await appendAuditLog({
    venueId: anchorVenueId,
    actorId: cashierId ?? null,
    action: 'cross_venue_unlock',
    entityType: 'cross_venue_group',
    entityId: groupId,
    summary: `Released cross-venue settlement (${members.length} cheque(s))`,
    details: { chequeIds: members.map((m) => m.id) },
  });

  return { groupId, released: true };
}

function buildCrossVenueReceipt(members, { tendered, change, method }) {
  const lines = ['CROSS-VENUE SETTLEMENT', '==='];
  let grand = 0;
  for (const member of members) {
    const serialized = serializeCheque(member);
    const total = serialized.total;
    grand += total;
    lines.push(`${member.venue?.nameEn ?? 'Venue'} — Cheque #${serialized.chequeNumber}`);
    lines.push(`  Table ${serialized.tableLabel ?? '—'}: ${total.toFixed(2)}`);
  }
  lines.push('---', `Total: ${grand.toFixed(2)}`, `Method: ${method}`);
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
  method = 'cash',
  cardLast4,
  tendered,
  managerPin,
}) {
  ensureFeatureEnabled();
  const members = await loadGroupMembers(groupId);
  if (!members.length) throw notFound('Cross-venue settlement not found');

  const openMembers = members.filter((m) => m.status === 'open');
  if (!openMembers.length) throw validationError('Settlement is already paid');

  const memberTotals = openMembers.map((member) => ({
    member,
    total: computeChequeTotal(member),
  }));
  const combinedTotal = Number(
    memberTotals.reduce((sum, m) => sum + m.total, 0).toFixed(2),
  );
  if (combinedTotal <= 0) throw validationError('Nothing to settle');

  if (cardLast4 && method !== 'card') {
    throw validationError('Card last-4 is only valid for card payments');
  }
  if (cardLast4 && !/^\d{4}$/.test(cardLast4)) {
    throw validationError('Card last-4 must be exactly 4 digits');
  }

  await assertManualCardPaymentsAllowed(
    [{ method, amount: combinedTotal, cardLast4: cardLast4 ?? null }],
    {
      manualCardEnabled: config.featureManualCardEnabled,
      approvalThreshold: config.manualCardApprovalThreshold,
      managerPin,
      venueId: anchorVenueId,
    },
  );

  let change = null;
  if (tendered != null) {
    if (method === 'cash' && tendered < combinedTotal) {
      throw validationError('Tendered amount is less than amount due');
    }
    change = Number((tendered - combinedTotal).toFixed(2));
  }

  // Settle each member against the anchor cashier's active shift (the drawer
  // physically taking the money), but credit revenue to the member's venue.
  const activeShift = anchorTerminalId
    ? await requireActiveShift(cashierId, anchorTerminalId, anchorVenueId)
    : null;

  await prisma.$transaction(async (tx) => {
    for (const { member, total } of memberTotals) {
      await tx.payment.create({
        data: {
          chequeId: member.id,
          cashierId,
          shiftId: activeShift?.id ?? null,
          method,
          amount: total,
          cardLast4: method === 'card' ? (cardLast4 ?? null) : null,
        },
      });

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
        await tx.order.delete({ where: { id: draft.id } });
      }

      await tx.cheque.update({
        where: { id: member.id },
        data: { status: 'paid', closedAt: new Date() },
      });
    }
  });

  const paidMembers = await loadGroupMembers(groupId);
  const receipt = buildCrossVenueReceipt(paidMembers, { tendered, change, method });

  await appendAuditLog({
    venueId: anchorVenueId,
    actorId: cashierId,
    action: 'cross_venue_pay',
    entityType: 'cross_venue_group',
    entityId: groupId,
    summary: `Cross-venue settlement paid: ${combinedTotal.toFixed(2)} across ${openMembers.length} venue(s)`,
    details: {
      method,
      combinedTotal,
      members: memberTotals.map((m) => ({
        chequeId: m.member.id,
        venueId: m.member.venueId,
        total: m.total,
      })),
    },
  });

  return {
    group: serializeGroup(groupId, anchorVenueId, paidMembers),
    receipt,
    change,
    combinedTotal,
  };
}
