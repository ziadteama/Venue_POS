export function managerActionPath(target) {
  if (!target) return null;
  switch (target.type) {
    case 'round':
      return `/api/v1/manager/cheques/${target.chequeId}/orders/${target.orderId}/void`;
    case 'cheque':
      return `/api/v1/manager/cheques/${target.chequeId}/void`;
    case 'discount':
      return `/api/v1/manager/cheques/${target.chequeId}/discount/request`;
    case 'refund':
      return `/api/v1/manager/cheques/${target.chequeId}/refund/request`;
    case 'comp':
      return `/api/v1/manager/cheques/${target.chequeId}/orders/${target.orderId}/items/${target.itemId}/comp`;
    default:
      return null;
  }
}

export function billableOrders(detail) {
  return (
    detail?.orders?.filter(
      (o) => o.status !== 'draft' && o.status !== 'voided' && o.items?.length > 0,
    ) ?? []
  );
}
