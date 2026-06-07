export const ROLES = {
  HUB_MANAGER: 'hub_manager',
  VENUE_MANAGER: 'venue_manager',
  CASHIER: 'cashier',
  KITCHEN_STAFF: 'kitchen_staff',
  SYSTEM_ADMIN: 'system_admin',
};

/** Roles allowed to sign in to the web dashboard (hub GM / hub owner). Floor venue managers use POS only. */
export const DASHBOARD_ROLES = [ROLES.HUB_MANAGER];

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

export const API_VERSION = 'v1';
export const API_BASE = `/api/${API_VERSION}`;
