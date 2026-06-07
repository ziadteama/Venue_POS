const BILLABLE = ['sent', 'partially_ready', 'ready', 'served'];

export function chequeHasContent(cheque) {
  if (!cheque) return false;
  if ((cheque.total ?? 0) > 0) return true;
  if ((cheque.draftOrder?.items?.length ?? 0) > 0) return true;
  return false;
}

export function normalizeTableLabel(value) {
  return String(value ?? '').trim().slice(0, 50);
}

export function canDeleteCheque(cheque) {
  return Boolean(cheque && !cheque.parentChequeId && !chequeHasContent(cheque));
}

export function parentOpenCheques(openCheques) {
  return (openCheques ?? []).filter((c) => !c.parentChequeId && !c.splitLabel);
}

export function firedOrders(cheque) {
  return (cheque?.orders ?? []).filter(
    (o) => o.status !== 'draft' && (o.items?.length ?? 0) > 0,
  );
}

export function splittableItems(cheque) {
  if (!cheque || cheque.parentChequeId) return [];
  if (cheque.childCheques?.some((c) => c.splitAmount != null)) return [];
  return (cheque.orders ?? [])
    .filter((o) => BILLABLE.includes(o.status))
    .flatMap((o) => o.items)
    .filter((i) => !i.billingChequeId && !i.paidAt && !i.isComped);
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
