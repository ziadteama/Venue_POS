export const ROLES = {
  HUB_MANAGER: 'hub_manager',
  VENUE_MANAGER: 'venue_manager',
  CASHIER: 'cashier',
  KITCHEN_STAFF: 'kitchen_staff',
  SYSTEM_ADMIN: 'system_admin',
};

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
