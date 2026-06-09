import { ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { serializeVenueTableLabels } from '../utils/venue-tables.js';
import { getEnabledTargets } from './billing-config-service.js';
import { getPublishedMenuForVenue } from './menu-service.js';

const OFFLINE_PIN_ROLES = [ROLES.CASHIER, ROLES.VENUE_MANAGER];

/** Staff roster + features snapshot for terminal offline cache. */
export async function getTerminalRoster(venueId) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { tables: true, type: true, nameEn: true, nameAr: true },
  });
  if (!venue) return null;

  const staff = await prisma.user.findMany({
    where: {
      venueId,
      role: { in: OFFLINE_PIN_ROLES },
      isActive: true,
      pinHash: { not: null },
    },
    select: { id: true, username: true, role: true, pinHash: true },
  });

  const crossVenueTargets = config.featureCrossVenueBilling
    ? await getEnabledTargets(venueId)
    : [];

  const features = {
    manualCardPayment: config.featureManualCardEnabled,
    manualCardApprovalThreshold: config.manualCardApprovalThreshold,
    kdsEnabled: config.featureKdsEnabled,
    lineTransfer: config.featureLineTransferEnabled,
    discounts: config.featureDiscountsEnabled,
    refunds: config.featureRefundsEnabled,
    autoReceiptPrint: config.featureAutoReceiptPrint,
    tables: serializeVenueTableLabels(venue.tables),
    crossVenueBilling: config.featureCrossVenueBilling && crossVenueTargets.length > 0,
    isAnchor: venue.type === 'anchor',
    crossVenueTargets,
    anchorVenue:
      venue.type === 'anchor'
        ? { id: venueId, nameEn: venue.nameEn, nameAr: venue.nameAr }
        : null,
  };

  let menuVersionHash = null;
  try {
    const menu = await getPublishedMenuForVenue(venueId);
    menuVersionHash = menu?.versionHash ?? null;
  } catch {
    /* menu may be unpublished */
  }

  return {
    staff: staff.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      pinHash: u.pinHash,
    })),
    features,
    menuVersionHash,
    syncedAt: new Date().toISOString(),
  };
}

/** Reconnect handshake — compare menu hash and return hints for agent. */
export async function terminalReconnectHandshake(venueId, { menuVersionHash, lastSyncAt } = {}) {
  const roster = await getTerminalRoster(venueId);
  const serverHash = roster?.menuVersionHash ?? null;
  const menuStale = Boolean(serverHash && menuVersionHash && serverHash !== menuVersionHash);

  return {
    menuStale,
    menuVersionHash: serverHash,
    lastSyncAt: lastSyncAt ?? null,
    serverTime: new Date().toISOString(),
    features: roster?.features ?? null,
    staff: roster?.staff ?? [],
  };
}
