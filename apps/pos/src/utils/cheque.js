const BILLABLE = ['sent', 'partially_ready', 'ready', 'served'];

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
