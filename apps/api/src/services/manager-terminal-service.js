import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { hashSecret } from './auth-service.js';
import { appendAuditLog } from './audit-log-service.js';
import { notFound, validationError } from '../utils/errors.js';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

export function deriveTerminalStatus(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) return 'pending';
  const lastSeenMs = lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
  if (Number.isNaN(lastSeenMs)) return 'pending';
  return now - lastSeenMs < OFFLINE_THRESHOLD_MS ? 'online' : 'offline';
}

export function serializeTerminalRow(terminal, now = Date.now()) {
  return {
    id: terminal.id,
    name: terminal.name,
    venueId: terminal.venueId,
    venueNameEn: terminal.venue.nameEn,
    venueNameAr: terminal.venue.nameAr,
    isCoordinator: terminal.isCoordinator,
    coordinatorLanHost: terminal.coordinatorLanHost,
    assignedLanHost: terminal.assignedLanHost,
    lastSeenAt: terminal.lastSeenAt?.toISOString() ?? null,
    syncQueueDepth: terminal.syncQueueDepth,
    lastLanHost: terminal.lastLanHost,
    lastLanPort: terminal.lastLanPort,
    lastAgentPriority: terminal.lastAgentPriority,
    lastClusterMode: terminal.lastClusterMode,
    status: deriveTerminalStatus(terminal.lastSeenAt, now),
  };
}

async function defaultTerminalName(venueId) {
  const count = await prisma.terminal.count({ where: { venueId, isActive: true } });
  return `POS-${count + 1}`;
}

export async function createTerminal(actor, { venueId, name }) {
  if (!venueId) throw validationError('venueId is required');

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue?.isActive) throw notFound('Venue not found');

  const trimmedName = name?.trim();
  const terminalName = trimmedName || (await defaultTerminalName(venueId));
  const plainSecret = randomBytes(32).toString('base64url');
  const secretHash = await hashSecret(plainSecret);

  const terminal = await prisma.terminal.create({
    data: {
      id: randomUUID(),
      venueId,
      name: terminalName,
      secretHash,
      isActive: true,
    },
    include: { venue: { select: { id: true, nameEn: true, nameAr: true } } },
  });

  const actorId = actor?.id ?? actor?.sub ?? null;

  await appendAuditLog({
    venueId,
    actorId,
    actorUsername: actor?.username ?? null,
    action: 'terminal.created',
    entityType: 'terminal',
    entityId: terminal.id,
    summary: `Terminal "${terminalName}" created for ${venue.nameEn}`,
    details: { terminalId: terminal.id, name: terminalName },
  });

  return {
    id: terminal.id,
    venueId: terminal.venueId,
    name: terminal.name,
    secret: plainSecret,
    status: 'pending',
  };
}
