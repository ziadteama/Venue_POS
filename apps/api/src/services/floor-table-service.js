import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';
import {
  assertTableAvailable,
  findHubTableByLabel,
  listHubTables,
  occupyHubTable,
  releaseHubTableIfEmpty,
  resolveHubTable,
  serializeHubTable,
} from './hub-table-service.js';

export async function listFloorTables() {
  return listHubTables({ activeOnly: true });
}

export async function getFloorTable(tableLabel) {
  const row = await findHubTableByLabel(tableLabel);
  return row ? serializeHubTable(row) : null;
}

export async function occupyFloorTable({
  tableLabel,
  floorTableId,
  venueId,
  chequeId,
  crossVenueGroupId,
  terminalId,
  io,
}) {
  let hubTable;
  if (floorTableId) {
    hubTable = await prisma.floorTable.findUnique({ where: { id: floorTableId } });
    if (!hubTable) throw validationError('Table not found');
  } else {
    const trimmed = tableLabel?.trim();
    if (!trimmed) throw validationError('tableLabel required');
    hubTable = await resolveHubTable(trimmed);
  }

  await assertTableAvailable(hubTable.id, { chequeId, crossVenueGroupId });

  return occupyHubTable({
    floorTableId: hubTable.id,
    tableLabel: hubTable.tableLabel,
    chequeId,
    crossVenueGroupId,
    terminalId,
    venueId,
    io,
  });
}

export async function releaseFloorTable({ tableLabel, floorTableId, chequeId, io }) {
  let hubTableId = floorTableId;
  if (!hubTableId) {
    const trimmed = tableLabel?.trim();
    if (!trimmed) return null;
    const row = await findHubTableByLabel(trimmed);
    if (!row) return null;
    hubTableId = row.id;
  }

  const existing = await prisma.floorTable.findUnique({ where: { id: hubTableId } });
  if (!existing) return null;
  if (chequeId && existing.occupiedByChequeId && existing.occupiedByChequeId !== chequeId) {
    return serializeHubTable(existing);
  }

  return releaseHubTableIfEmpty({ floorTableId: hubTableId, io });
}
