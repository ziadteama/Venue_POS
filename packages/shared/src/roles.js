import { ROLES } from './constants.js';

/**
 * Product roles (see AGENTS.md). Matches common F&B / hospitality SaaS splits:
 * - Cashier: POS service (like Toast/Square front-of-house)
 * - Hub manager: multi-venue back office — menus, staff, config (ops GM)
 * - CEO (hub_owner): corporate reporting — revenue, EOD, approvals (owner/exec)
 *
 * venue_manager / kitchen_staff are venue staff types the hub manager provisions
 * for POS/KDS — not separate web logins.
 */
export const PRODUCT_ROLES = {
  CASHIER: ROLES.CASHIER,
  CEO: ROLES.HUB_OWNER,
  HUB_MANAGER: ROLES.HUB_MANAGER,
};

/** Staff roles hub manager can create per venue (POS/KDS). */
export const VENUE_STAFF_ROLES = [ROLES.CASHIER, ROLES.KITCHEN_STAFF, ROLES.VENUE_MANAGER];

/** Roles whose PIN can authorize manager actions on a POS terminal. */
export const POS_MANAGER_PIN_ROLES = [ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER];

export function isCeo(role) {
  return role === ROLES.HUB_OWNER;
}

export function isHubManager(role) {
  return role === ROLES.HUB_MANAGER;
}

export function isDashboardRole(role) {
  return role === ROLES.HUB_OWNER || role === ROLES.HUB_MANAGER;
}

/** i18n key under `roles.*` for dashboard role badges. */
export function dashboardRoleI18nKey(role) {
  if (role === ROLES.HUB_OWNER) return 'roles.ceo';
  if (role === ROLES.HUB_MANAGER) return 'roles.hubManager';
  return 'roles.unknown';
}

/** i18n key under `users.role.*` for staff list. */
export function staffRoleI18nKey(role) {
  if (role === ROLES.CASHIER) return 'users.role.cashier';
  if (role === ROLES.KITCHEN_STAFF) return 'users.role.kitchen_staff';
  if (role === ROLES.VENUE_MANAGER) return 'users.role.venue_manager';
  return `users.role.${role}`;
}
