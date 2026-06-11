import { ROLES } from './constants.js';

/**
 * Product roles (see AGENTS.md). Matches multi-unit F&B SaaS (Toast, Lightspeed, Square):
 * - Cashier: POS — ring orders, take payment
 * - Hub manager: back office — menus, staff, permissions, cheques, shifts, approvals, audit
 * - CEO (hub_owner): executive overview; revenue/P&L only for the `owner` account (see financial-access.js)
 *
 * venue_manager / kitchen_staff are venue staff the hub manager provisions for POS/KDS.
 */
export const PRODUCT_ROLES = {
  CASHIER: ROLES.CASHIER,
  CEO: ROLES.HUB_OWNER,
  HUB_MANAGER: ROLES.HUB_MANAGER,
};

/** Staff roles hub manager can create per venue (POS/KDS). */
export const VENUE_STAFF_ROLES = [ROLES.CASHIER, ROLES.KITCHEN_STAFF, ROLES.VENUE_MANAGER];

/** Roles a hub manager may provision (POS floor staff). */
export const MANAGER_PROVISION_ROLES = [ROLES.CASHIER, ROLES.VENUE_MANAGER];

/** Roles the CEO (hub_owner) may provision. */
export const OWNER_PROVISION_ROLES = [ROLES.HUB_OWNER, ROLES.HUB_MANAGER, ROLES.CASHIER];

/** Dashboard login roles provisioned by the CEO. */
export const HUB_DASHBOARD_ROLES = [ROLES.HUB_OWNER, ROLES.HUB_MANAGER];

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
  if (role === ROLES.HUB_OWNER) return 'users.role.hub_owner';
  if (role === ROLES.HUB_MANAGER) return 'users.role.hub_manager';
  return `users.role.${role}`;
}

export function isHubDashboardRole(role) {
  return HUB_DASHBOARD_ROLES.includes(role);
}
