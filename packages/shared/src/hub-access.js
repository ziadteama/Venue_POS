import { ROLES } from './constants.js';

/** Business / revenue dashboard paths (hub owner). */
export const HUB_OWNER_PATHS = new Set([
  '/',
  '/analytics',
  '/cheques',
  '/shifts',
  '/orders',
  '/approvals',
  '/activity',
  '/health',
]);

/** Operations dashboard paths (hub manager). */
export const HUB_MANAGER_PATHS = new Set(['/menus', '/users', '/settings', '/activity', '/health']);

export function isHubOwner(role) {
  return role === ROLES.HUB_OWNER;
}

export function isHubManager(role) {
  return role === ROLES.HUB_MANAGER;
}

export function isHubStaff(role) {
  return isHubOwner(role) || isHubManager(role);
}

export function normalizeDashboardPath(pathname) {
  if (!pathname || pathname === '/') return '/';
  const base = pathname.split('?')[0].replace(/\/$/, '');
  return base || '/';
}

export function canAccessDashboardPath(role, pathname) {
  const path = normalizeDashboardPath(pathname);
  if (isHubOwner(role)) return HUB_OWNER_PATHS.has(path);
  if (isHubManager(role)) return HUB_MANAGER_PATHS.has(path);
  return false;
}

export function defaultDashboardPath(role) {
  if (isHubManager(role)) return '/menus';
  if (isHubOwner(role)) return '/';
  return '/login';
}

/** Hub staff may pass ?venueId=; others use JWT venue claim. */
export function resolveHubVenueId(user, queryVenueId) {
  if (queryVenueId && isHubStaff(user?.role)) return queryVenueId;
  return user?.venue_id ?? user?.venueId ?? null;
}
