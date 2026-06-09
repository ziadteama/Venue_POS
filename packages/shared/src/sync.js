/** Client sync queue event types (local-agent → cloud replay). */
export const SYNC_EVENT_TYPES = {
  ORDER_CREATE: 'order.create',
  ORDER_ADD_ITEM: 'order.add_item',
  ORDER_PATCH_ITEM: 'order.patch_item',
  ORDER_SEND: 'order.send',
  CHEQUE_OPEN: 'cheque.open',
  CHEQUE_FIRE: 'cheque.fire',
  CHEQUE_PAY: 'cheque.pay',
  CHEQUE_DISCOUNT: 'cheque.discount',
  CHEQUE_CLEAR: 'cheque.clear',
  PAYMENT_CREATE: 'payment.create',
  CROSS_VENUE_GROUP_PAY: 'cross_venue.group_pay',
};

export const SYNC_QUEUE_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  FAILED: 'failed',
};

export const MAX_SYNC_BATCH = 50;
export const SYNC_WORKER_INTERVAL_MS = 5000;
export const SYNC_MAX_RETRIES = 10;
