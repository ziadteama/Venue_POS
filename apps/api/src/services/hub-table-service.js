import { prisma } from '../db/prisma.js';
import { normalizeTableLabel, tableLabelsMatch } from '@venue-pos/shared';
import { notFound, validationError } from '../utils/errors.js';
import { emitHubTablesUpdated } from '../plugins/socket.js';

function emitFloorTableUpdated(io, payload) {
  if (!io?.to) return;
  const message = { event: 'floor:table_updated', payload };
  io.to('dashboard:hub').emit('floor:table_updated', message);
  if (payload.venueId) {
    io.to(`venue:${payload.venueId}:pos`).emit('floor:table_updated', message);
  }
}

export function serializeHubTable(row) {
  return {
    id: row.id,
    tableLabel: row.tableLabel,
    sortOrder: row.sortOrder ?? 0,
    isActive: row.isActive ?? true,
    venueId: row.venueId,
    occupiedByChequeId: row.occupiedByChequeId,
    occupiedCrossVenueGroupId: row.occupiedCrossVenueGroupId,
    lockedByTerminalId: row.lockedByTerminalId,
    updatedAt: row.updatedAt.toISOString(),
    isOccupied: Boolean(row.occupiedByChequeId),
  };
}

export async function listHubTables({ activeOnly = false } = {}) {
  const where = activeOnly ? { isActive: true } : {};
  const rows = await prisma.floorTable.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { tableLabel: 'asc' }],
  });
  return rows.map(serializeHubTable);
}

export async function findHubTableByLabel(label, tx = prisma, { includeInactive = false } = {}) {
  const trimmed = normalizeTableLabel(label);
  if (!trimmed) return null;
  const exact = await tx.floorTable.findUnique({ where: { tableLabel: trimmed } });
  if (exact && (includeInactive || exact.isActive)) return exact;
  const rows = await tx.floorTable.findMany({
    where: includeInactive ? {} : { isActive: true },
  });
  return rows.find((row) => tableLabelsMatch(row.tableLabel, trimmed)) ?? null;
}

export async function resolveHubTable(label, tx = prisma, { allowCreate = true } = {}) {
  const trimmed = normalizeTableLabel(label);
  if (!trimmed) throw validationError('Table label is required');

  const row = await findHubTableByLabel(trimmed, tx);
  if (row) {
    if (!row.isActive) throw validationError('Table is inactive');
    return row;
  }
  if (!allowCreate) throw validationError('Table is not in hub floor plan');

  return tx.floorTable.create({
    data: { tableLabel: trimmed, sortOrder: 0, isActive: true },
  });
}

function groupsShareTable(crossVenueGroupId, occupierGroupId) {
  return Boolean(crossVenueGroupId && occupierGroupId && crossVenueGroupId === occupierGroupId);
}

export async function assertTableAvailable(
  floorTableId,
  { chequeId, crossVenueGroupId } = {},
  tx = prisma,
) {
  const occupiers = await tx.cheque.findMany({
    where: {
      floorTableId,
      status: 'open',
      parentChequeId: null,
      ...(chequeId ? { id: { not: chequeId } } : {}),
    },
    select: { id: true, crossVenueGroupId: true },
  });

  for (const occupier of occupiers) {
    if (!groupsShareTable(crossVenueGroupId, occupier.crossVenueGroupId)) {
      throw validationError('Table is already occupied');
    }
  }
}

export async function occupyHubTable(
  {
    floorTableId,
    tableLabel,
    chequeId,
    crossVenueGroupId,
    terminalId,
    venueId,
    io,
  },
  tx = prisma,
) {
  const row = await tx.floorTable.update({
    where: { id: floorTableId },
    data: {
      occupiedByChequeId: chequeId ?? null,
      occupiedCrossVenueGroupId: crossVenueGroupId ?? null,
      lockedByTerminalId: terminalId ?? null,
      venueId: venueId ?? null,
    },
  });
  const payload = serializeHubTable(row);
  if (tableLabel) payload.tableLabel = tableLabel;
  emitFloorTableUpdated(io, payload);
  return payload;
}

export async function releaseHubTableIfEmpty({ floorTableId, io }, tx = prisma) {
  const openCount = await tx.cheque.count({
    where: { floorTableId, status: 'open', parentChequeId: null },
  });
  if (openCount > 0) return null;

  const existing = await tx.floorTable.findUnique({ where: { id: floorTableId } });
  if (!existing?.occupiedByChequeId) return existing ? serializeHubTable(existing) : null;

  const row = await tx.floorTable.update({
    where: { id: floorTableId },
    data: {
      occupiedByChequeId: null,
      occupiedCrossVenueGroupId: null,
      lockedByTerminalId: null,
      venueId: null,
    },
  });
  const payload = serializeHubTable(row);
  emitFloorTableUpdated(io, payload);
  return payload;
}

export async function syncChequeOrdersFloorTable(tx, chequeId, floorTableId, tableLabel) {
  const links = await tx.chequeOrder.findMany({
    where: { chequeId },
    select: { orderId: true },
  });
  const orderIds = links.map((l) => l.orderId);
  if (!orderIds.length) return;
  await tx.order.updateMany({
    where: { id: { in: orderIds } },
    data: { floorTableId, tableLabel },
  });
}

export async function createHubTable({ tableLabel, sortOrder = 0 }) {
  const trimmed = normalizeTableLabel(tableLabel);
  if (!trimmed) throw validationError('Table label is required');

  const conflict = await findHubTableByLabel(trimmed, prisma, { includeInactive: true });
  if (conflict) throw validationError('Table label already exists');

  const row = await prisma.floorTable.create({
    data: { tableLabel: trimmed, sortOrder, isActive: true },
  });
  return serializeHubTable(row);
}

export async function updateHubTable(id, { tableLabel, sortOrder, isActive }) {
  const existing = await prisma.floorTable.findUnique({ where: { id } });
  if (!existing) throw notFound('Table not found');

  const data = {};
  if (tableLabel != null) {
    const trimmed = normalizeTableLabel(tableLabel);
    if (!trimmed) throw validationError('Table label is required');
    const conflict = await findHubTableByLabel(trimmed);
    if (conflict && conflict.id !== id) throw validationError('Table label already exists');
    data.tableLabel = trimmed;
  }
  if (sortOrder != null) data.sortOrder = Number(sortOrder);
  if (isActive != null) data.isActive = Boolean(isActive);

  if (Object.keys(data).length === 0) throw validationError('No changes provided');

  const row = await prisma.floorTable.update({ where: { id }, data });
  return serializeHubTable(row);
}

export async function deleteHubTable(id) {
  const existing = await prisma.floorTable.findUnique({ where: { id } });
  if (!existing) throw notFound('Table not found');
  if (existing.occupiedByChequeId) {
    throw validationError('Cannot delete an occupied table');
  }
  const openCheques = await prisma.cheque.count({
    where: { floorTableId: id, status: 'open' },
  });
  if (openCheques > 0) throw validationError('Cannot delete a table with open cheques');

  await prisma.floorTable.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listHubTableLabels() {
  const rows = await listHubTables({ activeOnly: true });
  return rows.map((r) => r.tableLabel);
}

export async function broadcastHubTablesUpdated(io) {
  if (!io) return;
  const tables = await listHubTableLabels();
  emitHubTablesUpdated(io, { tables });
}
