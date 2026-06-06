const BILLABLE = ['sent', 'partially_ready', 'ready', 'served'];

export function splittableItems(cheque) {
  if (!cheque || cheque.parentChequeId) return [];
  return (cheque.orders ?? [])
    .filter((o) => BILLABLE.includes(o.status))
    .flatMap((o) => o.items)
    .filter((i) => !i.billingChequeId && !i.paidAt && !i.isComped);
}
