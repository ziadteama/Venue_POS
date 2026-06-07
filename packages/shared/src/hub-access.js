import { ROLES } from './constants.js';
import { isCeo, isHubManager } from './roles.js';

/** CEO / executive dashboard — revenue & investigation (multi-venue). */
export const CEO_DASHBOARD_PATHS = new Set([
  '/',
  '/analytics',
  '/cheques',
  '/shifts',
  '/orders',
  '/approvals',
  '/activity',
  '/health',
]);

/** Hub manager / ops dashboard — menus, staff, venue config. */
export const HUB_MANAGER_DASHBOARD_PATHS = new Set([
  '/menus',
  '/users',
  '/settings',
  '/activity',
  '/health',
]);

/** @deprecated use CEO_DASHBOARD_PATHS */
export const HUB_OWNER_PATHS = CEO_DASHBOARD_PATHS;

/** @deprecated use HUB_MANAGER_DASHBOARD_PATHS */
export const HUB_MANAGER_PATHS = HUB_MANAGER_DASHBOARD_PATHS;

export function isHubOwner(role) {
  return isCeo(role);
}

export { isHubManager, isCeo } from './roles.js';

export function isHubStaff(role) {
  return isCeo(role) || isHubManager(role);
}

export function normalizeDashboardPath(pathname) {
  if (!pathname || pathname === '/') return '/';
  const base = pathname.split('?')[0].replace(/\/$/, '');
  return base || '/';
}

export function canAccessDashboardPath(role, pathname) {
  const path = normalizeDashboardPath(pathname);
  if (isCeo(role)) return CEO_DASHBOARD_PATHS.has(path);
  if (isHubManager(role)) return HUB_MANAGER_DASHBOARD_PATHS.has(path);
  return false;
}

export function defaultDashboardPath(role) {
  if (isHubManager(role)) return '/menus';
  if (isCeo(role)) return '/';
  return '/login';
}

/** CEO and hub manager may pass ?venueId= for multi-venue hub scope. */
export function resolveHubVenueId(user, queryVenueId) {
  if (queryVenueId && isHubStaff(user?.role)) return queryVenueId;
  return user?.venue_id ?? user?.venueId ?? null;
}
