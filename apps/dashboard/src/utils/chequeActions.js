export function managerActionPath(target) {
  if (!target) return null;
  switch (target.type) {
    case 'round':
      return `/api/v1/manager/cheques/${target.chequeId}/orders/${target.orderId}/void`;
    case 'cheque':
      return `/api/v1/manager/cheques/${target.chequeId}/void`;
    case 'discount':
      return `/api/v1/manager/cheques/${target.chequeId}/discount`;
    case 'discount_change':
      return `/api/v1/manager/cheques/${target.chequeId}/discount`;
    case 'discount_remove':
      return `/api/v1/manager/cheques/${target.chequeId}/discount/remove`;
    case 'refund':
      return `/api/v1/manager/cheques/${target.chequeId}/refund`;
    case 'force_refund':
      return `/api/v1/manager/cheques/${target.chequeId}/refund/force`;
    case 'comp':
      return `/api/v1/manager/cheques/${target.chequeId}/orders/${target.orderId}/items/${target.itemId}/comp`;
    default:
      return null;
  }
}

export function managerActionMethod(target) {
  if (!target) return 'POST';
  if (target.type === 'discount_change') return 'PATCH';
  return 'POST';
}

export function billableOrders(detail) {
  return (
    detail?.orders?.filter(
      (o) => o.status !== 'draft' && o.status !== 'voided' && o.items?.length > 0,
    ) ?? []
  );
}
