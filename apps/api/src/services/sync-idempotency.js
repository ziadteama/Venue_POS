import { ERROR_CODES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { apiError } from '../utils/errors.js';

export function duplicateSyncIdError(resultJson = null) {
  const err = apiError(ERROR_CODES.DUPLICATE_SYNC_ID, 'Sync event already processed', 409);
  err.syncResult = resultJson;
  return err;
}

export async function findSyncResult(syncId) {
  if (!syncId) return null;
  const row = await prisma.syncEvent.findUnique({ where: { syncId } });
  return row?.resultJson ?? null;
}

export async function claimSyncEvent(syncId, terminalId, eventType) {
  if (!syncId) return null;
  const existing = await prisma.syncEvent.findUnique({ where: { syncId } });
  if (existing) {
    throw duplicateSyncIdError(existing.resultJson);
  }
  return prisma.syncEvent.create({
    data: { syncId, terminalId, eventType },
  });
}

export async function storeSyncResult(syncId, resultJson) {
  if (!syncId) return;
  const safe = JSON.parse(JSON.stringify(resultJson));
  await prisma.syncEvent.update({
    where: { syncId },
    data: { resultJson: safe },
  });
}

export async function withSyncIdempotency({ syncId, terminalId, eventType }, handler) {
  if (!syncId) return handler();

  const cached = await findSyncResult(syncId);
  if (cached) throw duplicateSyncIdError(cached);

  await claimSyncEvent(syncId, terminalId, eventType);
  const result = await handler();
  await storeSyncResult(syncId, result);
  return result;
}
