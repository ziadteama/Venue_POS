export const ROLES = {
  /** CEO — executive dashboard (revenue, analytics). Product name: CEO. */
  HUB_OWNER: 'hub_owner',
  /** Hub manager — ops dashboard (menus, staff, settings). */
  HUB_MANAGER: 'hub_manager',
  /** Shift / floor manager — POS manager PIN only; provisioned by hub manager. */
  VENUE_MANAGER: 'venue_manager',
  CASHIER: 'cashier',
  KITCHEN_STAFF: 'kitchen_staff',
  SYSTEM_ADMIN: 'system_admin',
};

/** Web dashboard: CEO + hub manager. Cashiers use POS PIN only. */
export const DASHBOARD_ROLES = [ROLES.HUB_OWNER, ROLES.HUB_MANAGER];

export const VENUE_TYPES = {
  STANDARD: 'standard',
  ANCHOR: 'anchor',
};

export const ORDER_STATUSES = [
  'draft',
  'sent',
  'partially_ready',
  'ready',
  'served',
  'billed',
  'closed',
  'voided',
];

/** Kitchen rounds the hub manager may void (includes `closed` after payment). */
export const VOIDABLE_ROUND_STATUSES = [
  'draft',
  'sent',
  'partially_ready',
  'ready',
  'served',
  'closed',
];

export const API_VERSION = 'v1';
export const API_BASE = `/api/${API_VERSION}`;
