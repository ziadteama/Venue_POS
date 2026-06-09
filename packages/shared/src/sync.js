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
  SHIFT_OPEN: 'shift.open',
  SHIFT_CLOSE: 'shift.close',
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
export const CHEQUE_HYDRATION_INTERVAL_MS = 30000;
export const PEER_GOSSIP_INTERVAL_MS = 3000;
export const PEER_STALE_MS = 15000;
export const CLUSTER_HYSTERESIS_TICKS = 2;
export const DEFAULT_AGENT_LAN_PORT = 3456;

/** Runtime cluster modes for local-agent LAN failover. */
export const CLUSTER_MODES = {
  DIRECT: 'direct',
  RELAY: 'relay',
  LEADER: 'leader',
  FOLLOWER: 'follower',
  ELECTING: 'electing',
};
