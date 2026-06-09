import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';

export async function listFloorTables() {
  const rows = await prisma.floorTable.findMany({ orderBy: { tableLabel: 'asc' } });
  return rows.map(serializeFloorTable);
}

export async function getFloorTable(tableLabel) {
  const row = await prisma.floorTable.findUnique({ where: { tableLabel } });
  return row ? serializeFloorTable(row) : null;
}

export async function occupyFloorTable({
  tableLabel,
  venueId,
  chequeId,
  terminalId,
  io,
}) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) throw validationError('tableLabel required');

  const row = await prisma.floorTable.upsert({
    where: { tableLabel: trimmed },
    create: {
      tableLabel: trimmed,
      venueId: venueId ?? null,
      occupiedByChequeId: chequeId ?? null,
      lockedByTerminalId: terminalId ?? null,
    },
    update: {
      venueId: venueId ?? undefined,
      occupiedByChequeId: chequeId ?? null,
      lockedByTerminalId: terminalId ?? null,
    },
  });

  const payload = serializeFloorTable(row);
  emitFloorTableUpdated(io, venueId, payload);
  return payload;
}

export async function releaseFloorTable({ tableLabel, chequeId, io }) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) return null;

  const existing = await prisma.floorTable.findUnique({ where: { tableLabel: trimmed } });
  if (!existing) return null;
  if (chequeId && existing.occupiedByChequeId && existing.occupiedByChequeId !== chequeId) {
    return serializeFloorTable(existing);
  }

  const row = await prisma.floorTable.update({
    where: { tableLabel: trimmed },
    data: {
      occupiedByChequeId: null,
      lockedByTerminalId: null,
    },
  });

  const payload = serializeFloorTable(row);
  emitFloorTableUpdated(io, row.venueId, payload);
  return payload;
}

function emitFloorTableUpdated(io, venueId, payload) {
  if (!io?.to) return;
  const message = { event: 'floor:table_updated', payload };
  io.to('dashboard:hub').emit('floor:table_updated', message);
  if (venueId) {
    io.to(`venue:${venueId}:pos`).emit('floor:table_updated', message);
  }
}

function serializeFloorTable(row) {
  return {
    id: row.id,
    tableLabel: row.tableLabel,
    venueId: row.venueId,
    occupiedByChequeId: row.occupiedByChequeId,
    lockedByTerminalId: row.lockedByTerminalId,
    updatedAt: row.updatedAt.toISOString(),
    isOccupied: Boolean(row.occupiedByChequeId),
  };
}
