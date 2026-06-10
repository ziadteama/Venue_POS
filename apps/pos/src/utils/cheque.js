import {
  normalizeTableLabel,
  normalizedTableKey,
  tableLabelsMatch,
} from '@venue-pos/shared';

export { normalizeTableLabel, tableLabelsMatch, normalizedTableKey };

const BILLABLE = ['sent', 'partially_ready', 'ready', 'served'];

export function findFloorRowForLabel(label, floorByLabel) {
  if (!floorByLabel?.size) return null;
  const direct = floorByLabel.get(label);
  if (direct) return direct;
  for (const [key, row] of floorByLabel) {
    if (tableLabelsMatch(key, label)) return row;
  }
  return null;
}

/** Resolve the open cheque shown on a floor tile (floor lock wins over label guess). */
/** Hub-wide block: occupied by another cheque/group (cross-sell siblings exempt). */
export function isHubTableBlocked(label, { floorByLabel, chequeId, crossVenueGroupId } = {}) {
  const floor = findFloorRowForLabel(label, floorByLabel);
  if (!floor?.isOccupied) return false;
  if (chequeId && floor.occupiedByChequeId === chequeId) return false;
  if (
    crossVenueGroupId &&
    floor.occupiedCrossVenueGroupId &&
    floor.occupiedCrossVenueGroupId === crossVenueGroupId
  ) {
    return false;
  }
  return true;
}

export function findOpenChequeForLabel(label, openCheques, floorByLabel) {
  const parents = parentOpenCheques(openCheques);
  const floor = findFloorRowForLabel(label, floorByLabel);
  if (floor?.occupiedByChequeId) {
    const byFloor = parents.find((cheque) => cheque.id === floor.occupiedByChequeId);
    if (byFloor) return byFloor;
  }
  return parents.find((cheque) => tableLabelsMatch(cheque.tableLabel, label)) ?? null;
}

export function queuedOrderItems(cheque) {
  if (!cheque) return [];
  if (cheque.draftOrder?.items?.length) return cheque.draftOrder.items;
  return (cheque.orders ?? [])
    .filter((order) => order.status === 'draft')
    .flatMap((order) => order.items ?? []);
}

export function openSplitChildren(cheque) {
  return (cheque?.childCheques ?? []).filter((child) => child.status === 'open');
}

export function hasOpenSplitChildren(cheque) {
  return openSplitChildren(cheque).length > 0;
}

/** Table/floor total including open split guest checks on the same table. */
export function displayChequeTotal(cheque) {
  if (!cheque) return 0;
  if (!hasOpenSplitChildren(cheque)) return Number(cheque.total ?? 0);
  const guestTotal = openSplitChildren(cheque).reduce(
    (sum, guest) => sum + Number(guest.total ?? 0),
    0,
  );
  return guestTotal + parentPayableTotal(cheque);
}

export function parentPayableTotal(cheque) {
  if (!cheque || cheque.parentChequeId) return 0;
  if (!hasOpenSplitChildren(cheque)) return Number(cheque.total ?? 0);
  const openChildren = openSplitChildren(cheque);
  if (openChildren.every((c) => c.splitAmount != null)) {
    return Number(cheque.total ?? 0);
  }
  return Number(cheque.total ?? 0);
}

export function splittableItems(cheque) {
  if (!cheque || cheque.parentChequeId) return [];
  if (cheque.childCheques?.some((c) => c.splitAmount != null)) return [];
  return (cheque.orders ?? [])
    .filter((o) => BILLABLE.includes(o.status))
    .flatMap((o) => o.items)
    .filter((i) => !i.billingChequeId && !i.paidAt && !i.isComped);
}

/** True when the table still has queued items or billable fired lines. */
export function chequeHasContent(cheque) {
  if (!cheque) return false;
  if (queuedOrderItems(cheque).length > 0) return true;
  if (splittableItems(cheque).length > 0) return true;
  if ((cheque.subtotalBeforeDiscount ?? 0) > 0) return true;
  return false;
}

export function canDeleteCheque(cheque) {
  return Boolean(
    cheque &&
      !cheque.parentChequeId &&
      !hasOpenSplitChildren(cheque) &&
      !chequeHasContent(cheque),
  );
}

/** Parent open cheques only — split sub-cheques are excluded via parentChequeId. */
export function parentOpenCheques(openCheques) {
  return (openCheques ?? []).filter((c) => !c.parentChequeId);
}

export function firedOrders(cheque) {
  return (cheque?.orders ?? []).filter(
    (o) => o.status !== 'draft' && (o.items?.length ?? 0) > 0,
  );
}

export function transferableItems(cheque) {
  return splittableItems(cheque);
}

export function canSplitByAmount(cheque) {
  if (!cheque || cheque.parentChequeId) return false;
  if (cheque.childCheques?.length) return false;
  const items = splittableItems(cheque);
  return items.length > 0 && (cheque.total ?? 0) > 0;
}
