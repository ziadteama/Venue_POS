import { randomUUID } from 'node:crypto';
import { getLinkedMenuCache } from './linked-menu-sync.js';

function findMenuItem(menu, menuItemId) {
  for (const cat of menu?.categories ?? []) {
    for (const item of cat.items ?? []) {
      if (item.id === menuItemId) return item;
    }
  }
  return null;
}

function itemLineTotal(item) {
  const modTotal = (item.modifiers ?? []).reduce((s, m) => s + Number(m.priceDelta ?? 0), 0);
  return (Number(item.unitPrice) + modTotal) * Number(item.quantity);
}

function computeVenueSubtotals(venue) {
  const pending = (venue.draftItems ?? []).reduce((s, i) => s + itemLineTotal(i), 0);
  const fired = (venue.sentRounds ?? []).reduce(
    (s, round) => s + round.items.reduce((rs, i) => rs + itemLineTotal(i), 0),
    0,
  );
  return {
    pendingSubtotal: Number(pending.toFixed(2)),
    firedSubtotal: Number(fired.toFixed(2)),
    displaySubtotal: Number((pending + fired).toFixed(2)),
  };
}

export function serializeCoordinatorGroup(group) {
  const cheques = (group.venues ?? []).map((v) => {
    const totals = computeVenueSubtotals(v);
    return {
      id: v.localChequeId ?? `${group.groupId}-${v.venueId}`,
      venueId: v.venueId,
      venueNameEn: v.venueNameEn,
      venueNameAr: v.venueNameAr,
      tableLabel: group.tableLabel,
      status: group.status === 'paid' ? 'paid' : 'open',
      draftOrder:
        v.draftItems?.length > 0
          ? {
              items: v.draftItems,
              subtotal: totals.pendingSubtotal,
            }
          : null,
      firedSubtotal: totals.firedSubtotal,
      pendingSubtotal: totals.pendingSubtotal,
      displaySubtotal: totals.displaySubtotal,
      discountAmount: 0,
      total: totals.displaySubtotal,
    };
  });

  const combinedTotal = Number(
    cheques.reduce((s, c) => s + c.firedSubtotal + c.pendingSubtotal, 0).toFixed(2),
  );

  return {
    groupId: group.groupId,
    anchorVenueId: group.anchorVenueId,
    anchorChequeId: group.anchorChequeId ?? group.groupId,
    tableLabel: group.tableLabel,
    status: group.status ?? 'open',
    offline: true,
    cheques,
    venues: cheques.map((c) => ({
      venueId: c.venueId,
      nameEn: c.venueNameEn,
      nameAr: c.venueNameAr,
      chequeId: c.id,
      draftOrder: c.draftOrder,
      firedSubtotal: c.firedSubtotal,
      pendingSubtotal: c.pendingSubtotal,
      displaySubtotal: c.displaySubtotal,
    })),
    combinedTotal,
    displayTotal: combinedTotal,
    pendingTotal: Number(cheques.reduce((s, c) => s + c.pendingSubtotal, 0).toFixed(2)),
  };
}

export function saveCoordinatorGroup(db, { groupId, anchorChequeId, anchorVenueId, groupJson }) {
  db.prepare(
    `INSERT INTO cross_venue_groups (id, anchor_cheque_id, anchor_venue_id, status, group_json)
     VALUES (?, ?, ?, 'open', ?)
     ON CONFLICT(id) DO UPDATE SET group_json = excluded.group_json, status = excluded.status`,
  ).run(groupId, anchorChequeId, anchorVenueId, JSON.stringify(groupJson));
  return getCoordinatorGroup(db, groupId);
}

export function getCoordinatorGroup(db, groupId) {
  const row = db.prepare(`SELECT * FROM cross_venue_groups WHERE id = ?`).get(groupId);
  if (!row) return null;
  const group = {
    groupId: row.id,
    anchorChequeId: row.anchor_cheque_id,
    anchorVenueId: row.anchor_venue_id,
    status: row.status,
    ...JSON.parse(row.group_json),
  };
  return serializeCoordinatorGroup(group);
}

export function getCoordinatorGroupRaw(db, groupId) {
  const row = db.prepare(`SELECT * FROM cross_venue_groups WHERE id = ?`).get(groupId);
  if (!row) return null;
  return {
    groupId: row.id,
    anchorChequeId: row.anchor_cheque_id,
    anchorVenueId: row.anchor_venue_id,
    status: row.status,
    ...JSON.parse(row.group_json),
  };
}

export function listCoordinatorGroups(db) {
  return db
    .prepare(`SELECT id FROM cross_venue_groups WHERE status = 'open'`)
    .all()
    .map((r) => getCoordinatorGroup(db, r.id))
    .filter(Boolean);
}

export function newGroupId() {
  return randomUUID();
}

function ensureVenueBlock(group, venueId, db) {
  let venue = group.venues?.find((v) => v.venueId === venueId);
  if (venue) return venue;

  const menu = getLinkedMenuCache(db, venueId);
  venue = {
    venueId,
    venueNameEn: menu?.venueNameEn ?? venueId,
    venueNameAr: menu?.venueNameAr ?? venueId,
    localChequeId: randomUUID(),
    draftItems: [],
    sentRounds: [],
  };
  group.venues = group.venues ?? [];
  group.venues.push(venue);
  return venue;
}

export function startCoordinatorGroup(db, { groupId, anchorVenueId, anchorTerminalId, cashierId, tableLabel }) {
  const anchorMenu = getLinkedMenuCache(db, anchorVenueId);
  const group = {
    groupId,
    anchorVenueId,
    anchorTerminalId,
    anchorChequeId: groupId,
    cashierId,
    tableLabel: tableLabel ?? null,
    status: 'open',
    venues: [
      {
        venueId: anchorVenueId,
        venueNameEn: anchorMenu?.venueNameEn ?? 'Anchor',
        venueNameAr: anchorMenu?.venueNameAr ?? 'Anchor',
        localChequeId: randomUUID(),
        draftItems: [],
        sentRounds: [],
      },
    ],
  };
  saveCoordinatorGroup(db, {
    groupId,
    anchorChequeId: groupId,
    anchorVenueId,
    groupJson: group,
  });
  return serializeCoordinatorGroup(group);
}

export function addCoordinatorGroupItem(
  db,
  groupId,
  { venueId, menuItemId, quantity = 1, modifiers = [] },
) {
  const group = getCoordinatorGroupRaw(db, groupId);
  if (!group) throw new Error('Cross-venue group not found');
  if (group.status === 'paid') throw new Error('Group is already paid');

  const menu = getLinkedMenuCache(db, venueId);
  if (!menu) throw new Error('Linked menu not cached for venue');

  const menuItem = findMenuItem(menu, menuItemId);
  if (!menuItem) throw new Error('Menu item not found');

  const venue = ensureVenueBlock(group, venueId, db);
  const item = {
    id: randomUUID(),
    menuItemId,
    quantity,
    unitPrice: Number(menuItem.price),
    nameEn: menuItem.nameEn,
    nameAr: menuItem.nameAr,
    modifiers: modifiers ?? [],
  };
  venue.draftItems.push(item);

  saveCoordinatorGroup(db, {
    groupId,
    anchorChequeId: group.anchorChequeId,
    anchorVenueId: group.anchorVenueId,
    groupJson: group,
  });
  return getCoordinatorGroup(db, groupId);
}

export function editCoordinatorGroupItem(db, groupId, { venueId, itemId, quantity }) {
  const group = getCoordinatorGroupRaw(db, groupId);
  if (!group) throw new Error('Cross-venue group not found');
  const venue = group.venues?.find((v) => v.venueId === venueId);
  if (!venue) throw new Error('Venue not in group');

  const item = venue.draftItems?.find((i) => i.id === itemId);
  if (!item) throw new Error('Item not found');

  if (quantity <= 0) {
    venue.draftItems = venue.draftItems.filter((i) => i.id !== itemId);
  } else {
    item.quantity = quantity;
  }

  saveCoordinatorGroup(db, {
    groupId,
    anchorChequeId: group.anchorChequeId,
    anchorVenueId: group.anchorVenueId,
    groupJson: group,
  });
  return getCoordinatorGroup(db, groupId);
}

export function removeCoordinatorGroupItem(db, groupId, { venueId, itemId }) {
  return editCoordinatorGroupItem(db, groupId, { venueId, itemId, quantity: 0 });
}

export function fireCoordinatorGroup(db, groupId, { venueId } = {}) {
  const group = getCoordinatorGroupRaw(db, groupId);
  if (!group) throw new Error('Cross-venue group not found');

  const targets = venueId
    ? group.venues.filter((v) => v.venueId === venueId)
    : group.venues;

  const sentOrders = [];
  for (const venue of targets) {
    if (!venue.draftItems?.length) continue;
    sentOrders.push({
      venueId: venue.venueId,
      items: venue.draftItems,
      status: 'sent',
    });
    venue.sentRounds = venue.sentRounds ?? [];
    venue.sentRounds.push({ id: randomUUID(), items: [...venue.draftItems] });
    venue.draftItems = [];
  }

  if (!sentOrders.length) throw new Error('No draft items to send');

  saveCoordinatorGroup(db, {
    groupId,
    anchorChequeId: group.anchorChequeId,
    anchorVenueId: group.anchorVenueId,
    groupJson: group,
  });

  return {
    sentOrders,
    group: getCoordinatorGroup(db, groupId),
  };
}

export function buildCoordinatorReplayPayload(group) {
  return {
    groupId: group.groupId,
    anchorVenueId: group.anchorVenueId,
    anchorTerminalId: group.anchorTerminalId,
    cashierId: group.cashierId,
    tableLabel: group.tableLabel,
    pay: true,
    venues: (group.venues ?? []).map((v) => ({
      venueId: v.venueId,
      fired: true,
      items: [
        ...(v.sentRounds ?? []).flatMap((r) => r.items),
        ...(v.draftItems ?? []),
      ].map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        modifiers: item.modifiers ?? [],
      })),
    })),
    payments: group.payments,
    method: group.payMethod,
    tendered: group.tendered,
    managerPin: group.managerPin,
  };
}

export function payCoordinatorGroup(
  db,
  groupId,
  { cashierId, payments, method, tendered, managerPin },
) {
  const group = getCoordinatorGroupRaw(db, groupId);
  if (!group) throw new Error('Cross-venue group not found');
  if (group.status === 'paid') throw new Error('Group already paid');

  for (const venue of group.venues ?? []) {
    if (venue.draftItems?.length) {
      throw new Error('Send all items to the kitchen before paying');
    }
  }

  const serialized = serializeCoordinatorGroup(group);
  const total = serialized.combinedTotal;
  const lines =
    payments?.length > 0 ? payments : [{ method: method ?? 'cash', amount: total }];

  const sum = lines.reduce((s, p) => s + Number(p.amount), 0);
  if (Math.abs(sum - total) > 0.02) throw new Error('Payment total must match cheque total');

  group.status = 'paid';
  group.payments = lines;
  group.payMethod = method;
  group.tendered = tendered;
  group.managerPin = managerPin;
  group.cashierId = cashierId ?? group.cashierId;

  db.prepare(`UPDATE cross_venue_groups SET status = 'paid', group_json = ? WHERE id = ?`).run(
    JSON.stringify(group),
    groupId,
  );

  const receipt = `OFFLINE CROSS-VENUE RECEIPT\nTotal ${total.toFixed(2)}`;
  return {
    group: getCoordinatorGroup(db, groupId),
    receipt,
    combinedTotal: total,
    replayPayload: buildCoordinatorReplayPayload(group),
  };
}
