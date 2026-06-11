import bcrypt from 'bcrypt';
import {
  HUB_DASHBOARD_ROLES,
  MANAGER_PROVISION_ROLES,
  OWNER_PROVISION_ROLES,
  ROLES,
  VENUE_STAFF_ROLES,
  isCeo,
  isHubDashboardRole,
  isHubManager,
} from '@venue-pos/shared';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { forbidden, notFound, validationError } from '../utils/errors.js';
import { assertPinUniqueGlobally, hashSecret } from './auth-service.js';
import { appendAuditLog } from './audit-log-service.js';

export { VENUE_STAFF_ROLES };

const userSelect = {
  id: true,
  username: true,
  role: true,
  cardUid: true,
  isActive: true,
  venueId: true,
  createdAt: true,
  updatedAt: true,
};

function assertPin(pin) {
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    throw validationError('PIN must be 4–6 digits');
  }
}

function assertPassword(password) {
  if (!password || password.length < 6) {
    throw validationError('Password must be at least 6 characters');
  }
}

function assertActorMayProvisionRole(actorRole, role) {
  if (isCeo(actorRole)) {
    if (!OWNER_PROVISION_ROLES.includes(role)) {
      throw validationError(`Role must be one of: ${OWNER_PROVISION_ROLES.join(', ')}`);
    }
    return;
  }
  if (isHubManager(actorRole)) {
    if (!MANAGER_PROVISION_ROLES.includes(role)) {
      throw validationError('Hub managers can only add cashiers');
    }
    return;
  }
  throw forbidden('Not allowed to manage users');
}

async function auditUserChange(actor, venueId, action, user, details) {
  await appendAuditLog({
    venueId: venueId ?? user.venueId ?? null,
    actorId: actor.id,
    actorUsername: actor.username,
    action,
    entityType: 'user',
    entityId: user.id,
    summary: `${action} — ${user.username ?? user.id}`,
    details,
  });
}

function serializeUser(user) {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function ownerListWhere({ venueId, search, includeInactive }) {
  const inactive = includeInactive ? {} : { isActive: true };
  const searchFilter = search?.trim()
    ? { username: { contains: search.trim(), mode: 'insensitive' } }
    : {};

  if (venueId) {
    return {
      ...inactive,
      ...searchFilter,
      OR: [{ role: { in: HUB_DASHBOARD_ROLES } }, { role: ROLES.CASHIER, venueId }],
    };
  }

  return {
    ...inactive,
    ...searchFilter,
    role: { in: OWNER_PROVISION_ROLES },
  };
}

async function findManagedUser(actor, userId, venueId) {
  if (isCeo(actor.role)) {
    return prisma.user.findFirst({
      where: {
        id: userId,
        ...ownerListWhere({ venueId, includeInactive: true }),
      },
    });
  }

  return prisma.user.findFirst({
    where: { id: userId, venueId, role: { in: VENUE_STAFF_ROLES } },
  });
}

export async function listManagedUsers(actor, { venueId, search, includeInactive = false } = {}) {
  if (isCeo(actor.role)) {
    const users = await prisma.user.findMany({
      where: ownerListWhere({ venueId, search, includeInactive }),
      select: userSelect,
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { username: 'asc' }],
    });
    return users.map(serializeUser);
  }

  if (!venueId) throw validationError('venueId query parameter is required');
  return listVenueUsers(venueId, { search, includeInactive });
}

export async function listVenueUsers(venueId, { search, includeInactive = false } = {}) {
  const users = await prisma.user.findMany({
    where: {
      venueId,
      role: { in: VENUE_STAFF_ROLES },
      ...(includeInactive ? {} : { isActive: true }),
      ...(search?.trim()
        ? { username: { contains: search.trim(), mode: 'insensitive' } }
        : {}),
    },
    select: userSelect,
    orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
  });
  return users.map(serializeUser);
}

export async function getVenueUserDetail(actor, userId, venueId) {
  const user = await findManagedUser(actor, userId, venueId);
  if (!user) throw notFound('User not found');

  if (user.role !== ROLES.CASHIER || !user.venueId) {
    return serializeUser(user);
  }

  const shifts = await prisma.shift.findMany({
    where: { cashierId: userId, venueId: user.venueId },
    orderBy: { openedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      openedAt: true,
      closedAt: true,
      openFloat: true,
      closeFloat: true,
      overShortAmount: true,
    },
  });

  return {
    ...serializeUser(user),
    shiftHistory: shifts.map((s) => ({
      id: s.id,
      status: s.status,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      openFloat: Number(s.openFloat),
      closeFloat: s.closeFloat != null ? Number(s.closeFloat) : null,
      overShortAmount: s.overShortAmount != null ? Number(s.overShortAmount) : null,
    })),
  };
}

export async function createManagedUser(actor, venueId, body) {
  const { username, role, pin, password, cardUid } = body;
  if (!username?.trim()) throw validationError('Username is required');
  assertActorMayProvisionRole(actor.role, role);

  const existing = await prisma.user.findFirst({ where: { username: username.trim() } });
  if (existing) throw validationError('Username already exists');

  if (isHubDashboardRole(role)) {
    if (!isCeo(actor.role)) throw forbidden('Only the owner can add dashboard users');
    assertPassword(password);
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        role,
        venueId: null,
        passwordHash: await bcrypt.hash(password, config.bcryptRounds),
        isActive: true,
      },
      select: userSelect,
    });
    await auditUserChange(actor, null, 'user.created', user, { role });
    return serializeUser(user);
  }

  if (role === ROLES.CASHIER) {
    if (!venueId) throw validationError('venueId is required for cashiers');
    assertPin(pin);
    await assertPinUniqueGlobally(pin);
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        role,
        venueId,
        pinHash: await hashSecret(pin),
        cardUid: cardUid?.trim() || null,
        isActive: true,
      },
      select: userSelect,
    });
    await auditUserChange(actor, venueId, 'user.created', user, { role, cardUid: user.cardUid });
    return serializeUser(user);
  }

  throw validationError('Unsupported role');
}

export async function createVenueUser(actor, venueId, body) {
  return createManagedUser(actor, venueId, body);
}

export async function updateManagedUser(actor, userId, venueId, body) {
  const user = await findManagedUser(actor, userId, venueId);
  if (!user) throw notFound('User not found');

  if (isHubManager(actor.role)) {
    if (user.role !== ROLES.CASHIER) throw forbidden('Hub managers can only update cashiers');
    if (body.role != null && body.role !== ROLES.CASHIER) {
      throw validationError('Hub managers can only assign the cashier role');
    }
  }

  const data = {};
  if (body.role != null) {
    assertActorMayProvisionRole(actor.role, body.role);
    data.role = body.role;
  }
  if (body.cardUid !== undefined && user.role === ROLES.CASHIER) {
    data.cardUid = body.cardUid?.trim() || null;
  }
  if (body.username?.trim()) {
    const clash = await prisma.user.findFirst({
      where: { username: body.username.trim(), NOT: { id: userId } },
    });
    if (clash) throw validationError('Username already exists');
    data.username = body.username.trim();
  }

  const updated = await prisma.user.update({ where: { id: userId }, data, select: userSelect });
  await auditUserChange(actor, user.venueId ?? venueId ?? null, 'user.updated', updated, data);
  return serializeUser(updated);
}

export async function updateVenueUser(actor, userId, venueId, body) {
  return updateManagedUser(actor, userId, venueId, body);
}

export async function resetManagedUserPin(actor, userId, venueId, pin) {
  const user = await findManagedUser(actor, userId, venueId);
  if (!user) throw notFound('User not found');
  if (user.role !== ROLES.CASHIER) throw validationError('PIN reset applies to cashiers only');
  if (isHubManager(actor.role) && user.role !== ROLES.CASHIER) {
    throw forbidden('Hub managers can only reset cashier PINs');
  }

  assertPin(pin);
  await assertPinUniqueGlobally(pin, { excludeUserId: userId });
  await prisma.user.update({ where: { id: userId }, data: { pinHash: await hashSecret(pin) } });
  await auditUserChange(actor, user.venueId ?? venueId ?? null, 'user.pin_reset', user, {});
  return { ok: true };
}

export async function resetVenueUserPin(actor, userId, venueId, pin) {
  return resetManagedUserPin(actor, userId, venueId, pin);
}

export async function resetManagedUserPassword(actor, userId, password) {
  if (!isCeo(actor.role)) throw forbidden('Only the owner can reset dashboard passwords');
  const user = await prisma.user.findFirst({
    where: { id: userId, role: { in: HUB_DASHBOARD_ROLES } },
  });
  if (!user) throw notFound('User not found');
  assertPassword(password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, config.bcryptRounds) },
  });
  await auditUserChange(actor, null, 'user.password_reset', user, {});
  return { ok: true };
}

export async function setManagedUserActive(actor, userId, venueId, isActive) {
  const user = await findManagedUser(actor, userId, venueId);
  if (!user) throw notFound('User not found');
  if (isHubManager(actor.role) && user.role !== ROLES.CASHIER) {
    throw forbidden('Hub managers can only deactivate cashiers');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: Boolean(isActive) },
    select: userSelect,
  });

  await auditUserChange(
    actor,
    user.venueId ?? venueId ?? null,
    isActive ? 'user.reactivated' : 'user.deactivated',
    updated,
    {},
  );
  return serializeUser(updated);
}

export async function setVenueUserActive(actor, userId, venueId, isActive) {
  return setManagedUserActive(actor, userId, venueId, isActive);
}

export async function importVenueUsersCsv(actor, venueId, csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw validationError('CSV must include header and at least one row');

  const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
  const usernameIdx = header.indexOf('username');
  const roleIdx = header.indexOf('role');
  const pinIdx = header.indexOf('pin');
  const cardIdx = header.indexOf('card_uid');
  if (usernameIdx < 0 || roleIdx < 0 || pinIdx < 0) {
    throw validationError('CSV header must include username, role, pin');
  }

  const created = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const role = cols[roleIdx];
    if (isHubManager(actor.role) && role !== ROLES.CASHIER) {
      throw validationError(`Row ${i + 1}: hub managers can only import cashiers`);
    }
    try {
      const user = await createManagedUser(actor, venueId, {
        username: cols[usernameIdx],
        role,
        pin: cols[pinIdx],
        cardUid: cardIdx >= 0 ? cols[cardIdx] : undefined,
      });
      created.push(user);
    } catch (err) {
      throw validationError(`Row ${i + 1}: ${err.message}`);
    }
  }
  return { imported: created.length, users: created };
}

export function usersListToCsv(users) {
  const lines = ['username,role,card_uid,is_active,created_at'];
  for (const u of users) {
    lines.push(
      [csvEscape(u.username), u.role, csvEscape(u.cardUid), u.isActive, u.createdAt].join(','),
    );
  }
  return lines.join('\n');
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
