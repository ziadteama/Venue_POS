import { VENUE_STAFF_ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import { hashSecret } from './auth-service.js';
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

function assertStaffRole(role) {
  if (!VENUE_STAFF_ROLES.includes(role)) {
    throw validationError(`Role must be one of: ${VENUE_STAFF_ROLES.join(', ')}`);
  }
}

function assertPin(pin) {
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    throw validationError('PIN must be 4–6 digits');
  }
}

async function auditUserChange(actor, venueId, action, user, details) {
  await appendAuditLog({
    venueId,
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

export async function getVenueUserDetail(userId, venueId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, venueId, role: { in: VENUE_STAFF_ROLES } },
    select: userSelect,
  });
  if (!user) throw notFound('User not found');

  const shifts = await prisma.shift.findMany({
    where: { cashierId: userId, venueId },
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

export async function createVenueUser(actor, venueId, body) {
  const { username, role, pin, cardUid } = body;
  if (!username?.trim()) throw validationError('Username is required');
  assertStaffRole(role);
  assertPin(pin);

  const existing = await prisma.user.findFirst({ where: { username: username.trim() } });
  if (existing) throw validationError('Username already exists');

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

export async function updateVenueUser(actor, userId, venueId, body) {
  const user = await prisma.user.findFirst({
    where: { id: userId, venueId, role: { in: VENUE_STAFF_ROLES } },
  });
  if (!user) throw notFound('User not found');

  const data = {};
  if (body.role != null) {
    assertStaffRole(body.role);
    data.role = body.role;
  }
  if (body.cardUid !== undefined) data.cardUid = body.cardUid?.trim() || null;
  if (body.username?.trim()) {
    const clash = await prisma.user.findFirst({
      where: { username: body.username.trim(), NOT: { id: userId } },
    });
    if (clash) throw validationError('Username already exists');
    data.username = body.username.trim();
  }

  const updated = await prisma.user.update({ where: { id: userId }, data, select: userSelect });
  await auditUserChange(actor, venueId, 'user.updated', updated, data);
  return serializeUser(updated);
}

export async function resetVenueUserPin(actor, userId, venueId, pin) {
  const user = await prisma.user.findFirst({
    where: { id: userId, venueId, role: { in: VENUE_STAFF_ROLES } },
  });
  if (!user) throw notFound('User not found');
  assertPin(pin);

  await prisma.user.update({ where: { id: userId }, data: { pinHash: await hashSecret(pin) } });
  await auditUserChange(actor, venueId, 'user.pin_reset', user, {});
  return { ok: true };
}

export async function setVenueUserActive(actor, userId, venueId, isActive) {
  const user = await prisma.user.findFirst({
    where: { id: userId, venueId, role: { in: VENUE_STAFF_ROLES } },
  });
  if (!user) throw notFound('User not found');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: Boolean(isActive) },
    select: userSelect,
  });

  await auditUserChange(
    actor,
    venueId,
    isActive ? 'user.reactivated' : 'user.deactivated',
    updated,
    {},
  );
  return serializeUser(updated);
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
    try {
      const user = await createVenueUser(actor, venueId, {
        username: cols[usernameIdx],
        role: cols[roleIdx],
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
