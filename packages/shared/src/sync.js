/** Client sync queue event types (local-agent → cloud replay). */
export const SYNC_EVENT_TYPES = {
  ORDER_CREATE: 'order.create',
  ORDER_ADD_ITEM: 'order.add_item',
  ORDER_PATCH_ITEM: 'order.patch_item',
  ORDER_SEND: 'order.send',
  ORDER_VOID: 'order.void',
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
export const SYNC_WORKER_INTERVAL_MS = 10_000;
export const SYNC_MAX_RETRIES = 10;
export const CHEQUE_HYDRATION_INTERVAL_MS = 90_000;
export const CHEQUE_HYDRATE_MIN_INTERVAL_MS = 30_000;
export const PEER_GOSSIP_INTERVAL_MS = 15_000;
export const PEER_STALE_MS = 25_000;
export const CLUSTER_HYSTERESIS_TICKS = 2;
export const CLOUD_HEALTH_PROBE_MS = 15_000;
export const CLOUD_HEALTH_FAILURES_TO_OFFLINE = 2;
export const TERMINAL_HEARTBEAT_INTERVAL_MS = 45_000;
export const DEFAULT_AGENT_LAN_PORT = 3456;

/** POS polls local-agent status (ms). Floor uses WS when online; see POS_FLOOR_POLL_OFFLINE_MS. */
export const POS_AGENT_STATUS_POLL_MS = 15_000;
export const POS_AGENT_STATUS_POLL_IDLE_MS = 25_000;
export const POS_FLOOR_POLL_OFFLINE_MS = 12_000;
export const POS_PRINTER_HEALTH_POLL_MS = 30_000;

/** Runtime cluster modes for local-agent LAN failover. */
export const CLUSTER_MODES = {
  DIRECT: 'direct',
  RELAY: 'relay',
  LEADER: 'leader',
  FOLLOWER: 'follower',
  ELECTING: 'electing',
};
