import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import { appendAuditLog } from './audit-log-service.js';

const venueSelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  type: true,
  isActive: true,
};

function serializeVenue(venue) {
  return {
    id: venue.id,
    nameEn: venue.nameEn,
    nameAr: venue.nameAr,
    type: venue.type,
    isActive: venue.isActive,
  };
}

function serializePair(row) {
  return {
    id: row.id,
    anchorVenueId: row.anchorVenueId,
    targetVenueId: row.targetVenueId,
    enabled: row.enabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Full matrix for the hub dashboard: every venue plus every configured pair. */
export async function listBillingMatrix() {
  const [venues, pairs] = await Promise.all([
    prisma.venue.findMany({ where: { isActive: true }, orderBy: { nameEn: 'asc' }, select: venueSelect }),
    prisma.venueBillingConfig.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);
  return {
    venues: venues.map(serializeVenue),
    pairs: pairs.map(serializePair),
  };
}

/** Active, enabled target venues an anchor venue may settle on a cross-venue cheque. */
export async function getEnabledTargets(anchorVenueId) {
  const rows = await prisma.venueBillingConfig.findMany({
    where: { anchorVenueId, enabled: true, targetVenue: { isActive: true } },
    include: { targetVenue: { select: venueSelect } },
    orderBy: { targetVenue: { nameEn: 'asc' } },
  });
  return rows.map((row) => serializeVenue(row.targetVenue));
}

/** True when the anchor venue may bill the target venue (same venue is always allowed). */
export async function isBillingAllowed(anchorVenueId, targetVenueId) {
  if (anchorVenueId === targetVenueId) return true;
  const row = await prisma.venueBillingConfig.findUnique({
    where: { anchorVenueId_targetVenueId: { anchorVenueId, targetVenueId } },
  });
  return Boolean(row?.enabled);
}

/** Whether a venue is configured as an anchor for at least one enabled target. */
export async function isAnchorVenue(anchorVenueId) {
  const count = await prisma.venueBillingConfig.count({
    where: { anchorVenueId, enabled: true, targetVenue: { isActive: true } },
  });
  return count > 0;
}

export async function setBillingPair({ anchorVenueId, targetVenueId, enabled, actorId, actorUsername }) {
  if (anchorVenueId === targetVenueId) {
    throw validationError('A venue cannot bill itself');
  }

  const [anchor, target] = await Promise.all([
    prisma.venue.findUnique({ where: { id: anchorVenueId }, select: venueSelect }),
    prisma.venue.findUnique({ where: { id: targetVenueId }, select: venueSelect }),
  ]);
  if (!anchor) throw notFound('Anchor venue not found');
  if (!target) throw notFound('Target venue not found');
  if (!anchor.isActive || !target.isActive) {
    throw validationError('Both venues must be active');
  }
  if (anchor.type !== 'anchor') {
    throw validationError('Only anchor venues can bill other venues');
  }

  const row = await prisma.venueBillingConfig.upsert({
    where: { anchorVenueId_targetVenueId: { anchorVenueId, targetVenueId } },
    update: { enabled },
    create: { anchorVenueId, targetVenueId, enabled },
  });

  await appendAuditLog({
    venueId: anchorVenueId,
    actorId,
    actorUsername,
    action: 'billing_config',
    entityType: 'venue_billing_config',
    entityId: row.id,
    summary: `${enabled ? 'Enabled' : 'Disabled'} cross-venue billing: ${anchor.nameEn} → ${target.nameEn}`,
    details: { anchorVenueId, targetVenueId, enabled },
  });

  return serializePair(row);
}
