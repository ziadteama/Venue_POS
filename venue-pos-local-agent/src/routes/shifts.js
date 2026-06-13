import { randomUUID } from 'node:crypto';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';
import { apiFetch, sendApiError } from '../services/api-fetch.js';
import { isCloudOnline } from '../services/cloud-health.js';
import { cacheActiveShift, getCachedShift, clearCachedShift } from '../services/shift-cache.js';
import { enqueueSync } from '../services/sync-processor.js';

export function registerShiftRoutes(app, { db, apiUrl, terminalId, terminalSecret }) {
  app.get('/v1/shifts/open-context', async (request, reply) => {
    const cashierId = request.query?.cashierId;
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const qs = new URLSearchParams({ cashierId }).toString();
    try {
      const ctx = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/shifts/open-context?${qs}`,
      );
      if (ctx?.activeShift) cacheActiveShift(db, cashierId, ctx.activeShift);
      return ctx;
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      const cached = getCachedShift(db, cashierId);
      return {
        hasActiveShift: Boolean(cached),
        activeShift: cached,
        openChequeCount: 0,
        offline: true,
      };
    }
  });

  app.get('/v1/shifts/active', async (request, reply) => {
    const cashierId = request.query?.cashierId;
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const qs = new URLSearchParams({ cashierId }).toString();
    try {
      const data = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/shifts/active?${qs}`,
      );
      if (data?.id) cacheActiveShift(db, cashierId, data);
      else clearCachedShift(db, cashierId);
      return data;
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      const cached = getCachedShift(db, cashierId);
      if (cached) return cached;
      return { active: false, offline: true };
    }
  });

  app.post('/v1/shifts/open', async (request, reply) => {
    const { cashierId, openFloat } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/shifts/open', {
        method: 'POST',
        body: JSON.stringify({ cashierId, openFloat }),
      });
      cacheActiveShift(db, cashierId, result);
      return result;
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      const localShift = {
        id: randomUUID(),
        cashierId,
        openFloat: openFloat ?? 0,
        openedAt: new Date().toISOString(),
        offline: true,
      };
      cacheActiveShift(db, cashierId, localShift);
      enqueueSync(
        db,
        SYNC_EVENT_TYPES.SHIFT_OPEN,
        { cashierId, openFloat, shiftId: localShift.id },
        randomUUID(),
      );
      return localShift;
    }
  });

  app.post('/v1/shifts/close', async (request, reply) => {
    const { cashierId, closeFloat, managerPin } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ cashierId, closeFloat, managerPin }),
      });
      clearCachedShift(db, cashierId);
      return result;
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      clearCachedShift(db, cashierId);
      enqueueSync(
        db,
        SYNC_EVENT_TYPES.SHIFT_CLOSE,
        { cashierId, closeFloat, managerPin },
        randomUUID(),
      );
      return { closed: true, offline: true };
    }
  });
}
