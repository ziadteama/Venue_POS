import bcrypt from 'bcrypt';
import { DASHBOARD_ROLES, ROLES, isKioskOverridePin } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { signAccessToken } from '../utils/jwt.js';
import { unauthorized, validationError } from '../utils/errors.js';
import { appendAuditLog } from './audit-log-service.js';

export async function loginManager(username, password) {
  const user = await prisma.user.findFirst({
    where: { username, isActive: true, passwordHash: { not: null } },
  });
  if (!user?.passwordHash) throw unauthorized('Invalid username or password');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw unauthorized('Invalid username or password');
  if (!DASHBOARD_ROLES.includes(user.role)) {
    throw unauthorized('Invalid username or password');
  }

  const token = signAccessToken({
    sub: user.id,
    role: user.role,
    venue_id: user.venueId,
    username: user.username,
  });

  appendAuditLog({
    venueId: user.venueId,
    actorId: user.id,
    actorUsername: user.username,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    summary: `Dashboard login: ${user.username}`,
    details: { role: user.role },
  }).catch(() => {});

  return {
    accessToken: token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      venueId: user.venueId,
    },
  };
}

export async function loginCashier(pin, terminalId, terminalSecret) {
  const terminal = await validateTerminal(terminalId, terminalSecret);

  const cashiers = await prisma.user.findMany({
    where: {
      venueId: terminal.venueId,
      role: 'cashier',
      isActive: true,
      pinHash: { not: null },
    },
  });

  let matched = null;
  for (const user of cashiers) {
    if (await bcrypt.compare(pin, user.pinHash)) {
      matched = user;
      break;
    }
  }
  if (!matched) throw unauthorized('Invalid PIN');

  const token = signAccessToken({
    sub: matched.id,
    role: matched.role,
    venue_id: matched.venueId,
    terminal_id: terminalId,
  });

  appendAuditLog({
    venueId: matched.venueId,
    actorId: matched.id,
    actorUsername: matched.username,
    action: 'auth.pin_login',
    entityType: 'user',
    entityId: matched.id,
    summary: `POS PIN login: ${matched.username ?? matched.id}`,
    details: { role: matched.role, terminalId },
  }).catch(() => {});

  return {
    accessToken: token,
    user: {
      id: matched.id,
      username: matched.username,
      role: matched.role,
      venueId: matched.venueId,
    },
    terminalId,
  };
}

/** POS manager PIN — shift managers (venue) + hub policy PIN (rare on terminal). */
const MANAGER_ROLES = ['hub_manager', 'venue_manager'];

/** Dashboard JWT session or POS PIN for void/comp/discount authority. */
export async function resolveDashboardManager(venueId, { initiatorId, managerPin } = {}) {
  if (initiatorId) {
    const user = await prisma.user.findUnique({ where: { id: initiatorId } });
    if (!user?.isActive) throw unauthorized('Manager not authorized');
    if (user.role === ROLES.HUB_MANAGER) return user;
    if (user.role === ROLES.VENUE_MANAGER && user.venueId === venueId) return user;
    throw unauthorized('Manager not authorized for this venue');
  }
  if (!managerPin) throw validationError('Manager PIN is required');
  return verifyManagerPin(venueId, managerPin);
}

/** Synthetic approver when IT override PIN is used on terminal routes. */
export function kioskOverrideApprover(venueId) {
  return {
    id: 'kiosk-override',
    username: 'kiosk_override',
    role: ROLES.VENUE_MANAGER,
    venueId,
    isActive: true,
  };
}

export async function verifyManagerPin(venueId, pin) {
  if (isKioskOverridePin(pin)) return kioskOverrideApprover(venueId);

  const managers = await prisma.user.findMany({
    where: {
      venueId,
      role: { in: MANAGER_ROLES },
      isActive: true,
      pinHash: { not: null },
    },
  });

  for (const user of managers) {
    if (await bcrypt.compare(pin, user.pinHash)) return user;
  }
  throw unauthorized('Invalid manager PIN');
}

export async function verifyManagerPinByRole(venueId, pin, role) {
  if (isKioskOverridePin(pin)) return kioskOverrideApprover(venueId);

  const managers = await prisma.user.findMany({
    where: { venueId, role, isActive: true, pinHash: { not: null } },
  });

  for (const user of managers) {
    if (await bcrypt.compare(pin, user.pinHash)) return user;
  }
  throw unauthorized(`Invalid ${role.replace('_', ' ')} PIN`);
}

/** POS terminal — shift / floor manager only (not hub manager PIN). */
export async function verifyFloorManagerPin(venueId, pin) {
  if (isKioskOverridePin(pin)) return kioskOverrideApprover(venueId);
  return verifyManagerPinByRole(venueId, pin, ROLES.VENUE_MANAGER);
}

/** Shift manager initiates on POS; hub manager co-signs (dual control). */
export async function verifyDualManagerApproval(
  venueId,
  { restaurantManagerPin, generalManagerPin },
) {
  const initiator = await verifyManagerPinByRole(
    venueId,
    restaurantManagerPin,
    'venue_manager',
  );
  const approver = await verifyManagerPinByRole(venueId, generalManagerPin, 'hub_manager');
  if (initiator.id === approver.id) {
    throw unauthorized('Initiator and approver must be different managers');
  }
  return { initiator, approver };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function validateTerminal(terminalId, terminalSecret) {
  if (!terminalId || !terminalSecret) {
    throw unauthorized('Terminal credentials required');
  }
  if (!UUID_RE.test(String(terminalId))) {
    throw validationError('Terminal ID must be a UUID from Dashboard → Settings → Terminals');
  }

  const terminal = await prisma.terminal.findUnique({ where: { id: terminalId } });
  if (!terminal?.isActive) throw unauthorized('Invalid terminal');

  const valid = await bcrypt.compare(terminalSecret, terminal.secretHash);
  if (!valid) throw unauthorized('Invalid terminal');

  return terminal;
}

export async function hashSecret(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

/**
 * Every staff PIN must be unique system-wide (cashiers, kitchen, shift managers,
 * hub manager policy PIN). PINs are stored hashed — compare in application code.
 */
export async function assertPinUniqueGlobally(pin, { excludeUserId } = {}) {
  if (!pin) return;
  const users = await prisma.user.findMany({
    where: {
      pinHash: { not: null },
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true, username: true, pinHash: true },
  });

  for (const user of users) {
    if (await bcrypt.compare(pin, user.pinHash)) {
      throw validationError(
        'This PIN is already assigned to another staff member. Choose a different PIN.',
      );
    }
  }
}
