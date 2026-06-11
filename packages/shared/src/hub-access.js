import { isCeo, isHubManager, isSystemAdmin } from './roles.js';

/** CEO — executive overview, activity audit, and hub user provisioning. */
export const CEO_DASHBOARD_PATHS = new Set(['/', '/activity', '/users']);

/** Hub manager — full back office (no executive overview or analytics). */
export const HUB_MANAGER_DASHBOARD_PATHS = new Set([
  '/',
  '/menus',
  '/users',
  '/settings',
  '/cheques',
  '/shifts',
  '/orders',
  '/approvals',
  '/activity',
  '/health',
]);

/** @deprecated use CEO_DASHBOARD_PATHS */
export const HUB_OWNER_PATHS = CEO_DASHBOARD_PATHS;

/** @deprecated use HUB_MANAGER_DASHBOARD_PATHS */
export const HUB_MANAGER_PATHS = HUB_MANAGER_DASHBOARD_PATHS;

/** Internal dev ops — monitoring console + hub feature flags. */
export const OPS_DASHBOARD_PATHS = new Set(['/ops', '/hub-settings']);

export function isHubOwner(role) {
  return isCeo(role);
}

export { isHubManager, isCeo } from './roles.js';

export function isHubStaff(role) {
  return isCeo(role) || isHubManager(role);
}

/** Hub roles that may pick a venue in multi-venue dashboard filters. */
export function canPickVenueStaff(role) {
  return isHubStaff(role);
}

export function normalizeDashboardPath(pathname) {
  if (!pathname || pathname === '/') return '/';
  const base = pathname.split('?')[0].replace(/\/$/, '');
  return base || '/';
}

export function canAccessDashboardPath(role, pathname) {
  const path = normalizeDashboardPath(pathname);
  if (path === '/analytics') {
    return false;
  }
  if (isSystemAdmin(role)) return OPS_DASHBOARD_PATHS.has(path);
  if (isCeo(role)) return CEO_DASHBOARD_PATHS.has(path);
  if (isHubManager(role)) return HUB_MANAGER_DASHBOARD_PATHS.has(path);
  return false;
}

export function defaultDashboardPath(role) {
  if (isSystemAdmin(role)) return '/ops';
  if (isCeo(role)) return '/';
  if (isHubManager(role)) return '/';
  return '/login';
}

/** Hub manager and CEO may pass ?venueId= for multi-venue hub scope. */
export function resolveHubVenueId(user, queryVenueId) {
  if (queryVenueId && isHubStaff(user?.role)) return queryVenueId;
  return user?.venue_id ?? user?.venueId ?? null;
}
