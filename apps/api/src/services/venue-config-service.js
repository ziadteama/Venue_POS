import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';

const RECEIPT_TEMPLATES = ['standard', 'compact', 'detailed'];
const VENUE_TYPES = ['standard', 'anchor'];

function decimalToNumber(value) {
  if (value == null) return 0;
  return Number(value);
}

function normalizeTableLayout(layout) {
  if (layout == null) return null;
  if (!Array.isArray(layout?.tables)) {
    throw validationError('tableLayout.tables must be an array');
  }
  const tables = layout.tables.map((table, index) => {
    const label = String(table.label ?? '').trim();
    if (!label) throw validationError('Each table requires a label');
    const x = Number(table.x ?? 0);
    const y = Number(table.y ?? 0);
    const seats = Number(table.seats ?? 4);
    if (!Number.isFinite(x) || x < 0 || x > 100) throw validationError('Invalid table x position');
    if (!Number.isFinite(y) || y < 0 || y > 100) throw validationError('Invalid table y position');
    if (!Number.isInteger(seats) || seats < 1 || seats > 20) {
      throw validationError('Table seats must be between 1 and 20');
    }
    return {
      id: table.id ?? `table-${index + 1}`,
      label,
      x: Math.round(x),
      y: Math.round(y),
      seats,
    };
  });
  return { tables };
}

export function serializeVenueConfig(venue) {
  return {
    id: venue.id,
    nameEn: venue.nameEn,
    nameAr: venue.nameAr,
    type: venue.type,
    currency: venue.currency,
    isActive: venue.isActive,
    taxRate: decimalToNumber(venue.taxRate),
    taxInclusive: venue.taxInclusive,
    receiptTemplate: venue.receiptTemplate,
    kitchenPrinterHost: venue.kitchenPrinterHost,
    kitchenPrinterPort: venue.kitchenPrinterPort,
    receiptPrinterHost: venue.receiptPrinterHost,
    receiptPrinterPort: venue.receiptPrinterPort,
    tableLayout: venue.tableLayout ?? { tables: [] },
    updatedAt: venue.updatedAt.toISOString(),
  };
}

export function serializeTerminalVenueSettings(venue) {
  return {
    venueId: venue.id,
    taxRate: decimalToNumber(venue.taxRate),
    taxInclusive: venue.taxInclusive,
    receiptTemplate: venue.receiptTemplate,
    kitchenPrinterHost: venue.kitchenPrinterHost,
    kitchenPrinterPort: venue.kitchenPrinterPort,
    receiptPrinterHost: venue.receiptPrinterHost ?? venue.kitchenPrinterHost,
    receiptPrinterPort: venue.receiptPrinterPort,
    tableLayout: venue.tableLayout ?? { tables: [] },
    updatedAt: venue.updatedAt.toISOString(),
  };
}

export async function getVenueConfig(venueId) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue) throw notFound('Venue not found');
  return serializeVenueConfig(venue);
}

export async function getTerminalVenueSettings(venueId) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue?.isActive) throw notFound('Venue not found');
  return serializeTerminalVenueSettings(venue);
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
  if (body.taxRate != null) {
    const taxRate = Number(body.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
      throw validationError('Tax rate must be between 0 and 1');
    }
    data.taxRate = taxRate;
  }
  if (body.taxInclusive != null) {
    data.taxInclusive = Boolean(body.taxInclusive);
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
  if (body.tableLayout !== undefined) {
    data.tableLayout = normalizeTableLayout(body.tableLayout);
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

  return {
    config: serializeVenueConfig(venue),
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
