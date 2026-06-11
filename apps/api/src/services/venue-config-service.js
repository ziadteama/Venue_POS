import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import {
  normalizeVenueTablesInput,
  parseVenueTables,
  serializeVenueTableLabels,
} from '../utils/venue-tables.js';
import { getHubBilling } from './hub-billing-service.js';
import { listHubTableLabels, resolveHubTable } from './hub-table-service.js';

const RECEIPT_TEMPLATES = ['standard', 'compact', 'detailed'];
const VENUE_TYPES = ['standard', 'anchor'];

function decimalToNumber(value) {
  if (value == null) return 0;
  return Number(value);
}

function hubBillingFields(hub) {
  return {
    taxRate: hub.taxRate,
    taxInclusive: hub.taxInclusive,
    serviceRate: hub.serviceRate,
    serviceEnabled: hub.serviceEnabled,
  };
}

export function serializeVenueConfig(venue, hub) {
  const billing = hub ? hubBillingFields(hub) : {
    taxRate: decimalToNumber(venue.taxRate),
    taxInclusive: venue.taxInclusive,
    serviceRate: decimalToNumber(venue.serviceRate),
    serviceEnabled: venue.serviceEnabled,
  };
  return {
    id: venue.id,
    nameEn: venue.nameEn,
    nameAr: venue.nameAr,
    type: venue.type,
    currency: venue.currency,
    isActive: venue.isActive,
    ...billing,
    receiptTemplate: venue.receiptTemplate,
    kitchenPrinterHost: venue.kitchenPrinterHost,
    kitchenPrinterPort: venue.kitchenPrinterPort,
    receiptPrinterHost: venue.receiptPrinterHost,
    receiptPrinterPort: venue.receiptPrinterPort,
    tables: parseVenueTables(venue.tables),
    updatedAt: venue.updatedAt.toISOString(),
  };
}

export function serializeTerminalVenueSettings(venue, hub) {
  const billing = hub ? hubBillingFields(hub) : {
    taxRate: decimalToNumber(venue.taxRate),
    taxInclusive: venue.taxInclusive,
    serviceRate: decimalToNumber(venue.serviceRate),
    serviceEnabled: venue.serviceEnabled,
  };
  return {
    venueId: venue.id,
    ...billing,
    receiptTemplate: venue.receiptTemplate,
    kitchenPrinterHost: venue.kitchenPrinterHost,
    kitchenPrinterPort: venue.kitchenPrinterPort,
    receiptPrinterHost: venue.receiptPrinterHost ?? venue.kitchenPrinterHost,
    receiptPrinterPort: venue.receiptPrinterPort,
    tables: serializeVenueTableLabels(venue.tables),
    updatedAt: venue.updatedAt.toISOString(),
  };
}

export async function assertTableAssigned(_venueId, tableLabel) {
  await resolveHubTable(tableLabel);
}

export async function getVenueConfig(venueId) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue) throw notFound('Venue not found');
  const hub = await getHubBilling();
  return serializeVenueConfig(venue, hub);
}

export async function createVenue(body, userId) {
  const nameEn = String(body.nameEn ?? '').trim();
  const nameAr = String(body.nameAr ?? '').trim();
  if (!nameEn) throw validationError('English name is required');
  if (!nameAr) throw validationError('Arabic name is required');

  const type = body.type ?? 'standard';
  if (!VENUE_TYPES.includes(type)) throw validationError('Invalid venue type');

  const hub = await getHubBilling();

  const venue = await prisma.$transaction(async (tx) => {
    const created = await tx.venue.create({
      data: {
        nameEn,
        nameAr,
        type,
        tables: [],
      },
    });
    await tx.venueMenu.create({
      data: { venueId: created.id, status: 'draft' },
    });
    await tx.venueConfigAudit.create({
      data: {
        venueId: created.id,
        userId,
        changes: { created: { nameEn, nameAr, type } },
      },
    });
    return created;
  });

  return serializeVenueConfig(venue, hub);
}

export async function getTerminalVenueSettings(venueId) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue?.isActive) throw notFound('Venue not found');
  const hub = await getHubBilling();
  const settings = serializeTerminalVenueSettings(venue, hub);
  settings.tables = await listHubTableLabels();
  return settings;
}

function buildUpdateData(body) {
  const data = {};

  if (body.nameEn != null) {
    const nameEn = String(body.nameEn).trim();
    if (!nameEn) throw validationError('English name is required');
    data.nameEn = nameEn;
  }
  if (body.nameAr != null) {
    const nameAr = String(body.nameAr).trim();
    if (!nameAr) throw validationError('Arabic name is required');
    data.nameAr = nameAr;
  }
  if (body.type != null) {
    if (!VENUE_TYPES.includes(body.type)) throw validationError('Invalid venue type');
    data.type = body.type;
  }
  if (
    body.taxRate != null ||
    body.taxInclusive != null ||
    body.serviceRate != null ||
    body.serviceEnabled != null
  ) {
    throw validationError('Tax and service are hub-wide — use Settings → Tax & service');
  }
  if (body.receiptTemplate != null) {
    if (!RECEIPT_TEMPLATES.includes(body.receiptTemplate)) {
      throw validationError('Invalid receipt template');
    }
    data.receiptTemplate = body.receiptTemplate;
  }
  if (body.kitchenPrinterHost !== undefined) {
    data.kitchenPrinterHost = body.kitchenPrinterHost?.trim() || null;
  }
  if (body.kitchenPrinterPort != null) {
    const port = Number(body.kitchenPrinterPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw validationError('Invalid kitchen printer port');
    }
    data.kitchenPrinterPort = port;
  }
  if (body.receiptPrinterHost !== undefined) {
    data.receiptPrinterHost = body.receiptPrinterHost?.trim() || null;
  }
  if (body.receiptPrinterPort != null) {
    const port = Number(body.receiptPrinterPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw validationError('Invalid receipt printer port');
    }
    data.receiptPrinterPort = port;
  }
  if (body.tables != null) {
    try {
      data.tables = normalizeVenueTablesInput(body.tables);
    } catch {
      throw validationError('Invalid tables list');
    }
  }

  if (Object.keys(data).length === 0) {
    throw validationError('No changes provided');
  }
  return data;
}

export async function updateVenueConfig(venueId, body, userId) {
  const existing = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!existing) throw notFound('Venue not found');

  const data = buildUpdateData(body);
  const changes = {};
  for (const key of Object.keys(data)) {
    const before = existing[key];
    const after = data[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes[key] = { from: before, to: after };
    }
  }

  const venue = await prisma.$transaction(async (tx) => {
    const updated = await tx.venue.update({ where: { id: venueId }, data });
    if (Object.keys(changes).length > 0) {
      await tx.venueConfigAudit.create({
        data: { venueId, userId, changes },
      });
    }
    return updated;
  });

  const hub = await getHubBilling();
  return {
    config: serializeVenueConfig(venue, hub),
    changes: Object.keys(changes),
  };
}

export async function listVenueConfigAudits(venueId, { limit = 20 } = {}) {
  const rows = await prisma.venueConfigAudit.findMany({
    where: { venueId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(50, Math.max(1, limit)),
    include: { user: { select: { username: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    venueId: row.venueId,
    changes: row.changes,
    createdAt: row.createdAt.toISOString(),
    user: row.user.username,
  }));
}
