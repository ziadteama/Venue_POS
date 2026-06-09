import { z } from 'zod';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { withSyncIdempotency } from '../services/sync-idempotency.js';
import {
  closeShift,
  countOpenChequesForCashier,
  getActiveShift,
  openShift,
} from '../services/shift-service.js';

const openShiftSchema = z.object({
  cashierId: z.string().uuid(),
  openFloat: z.coerce.number().min(0),
  syncId: z.string().uuid().optional(),
});

const closeShiftSchema = z.object({
  cashierId: z.string().uuid(),
  closeFloat: z.coerce.number().min(0),
  managerPin: z.string().min(4).max(6).optional(),
  syncId: z.string().uuid().optional(),
});

export async function shiftRoutes(app) {
  app.get('/api/v1/shifts/active', { preHandler: authenticateTerminal }, async (request) => {
    const cashierId = request.query.cashierId;
    if (!cashierId) throw validationError('cashierId required');
    const shift = await getActiveShift(cashierId, request.terminal.id, request.terminal.venueId);
    if (shift) return shift;
    return { active: false };
  });

  app.get('/api/v1/shifts/open-context', { preHandler: authenticateTerminal }, async (request) => {
    const cashierId = request.query.cashierId;
    if (!cashierId) throw validationError('cashierId required');
    const openChequeCount = await countOpenChequesForCashier(
      request.terminal.venueId,
      cashierId,
      request.terminal.id,
    );
    const existing = await getActiveShift(cashierId, request.terminal.id, request.terminal.venueId);
    return {
      openChequeCount,
      hasActiveShift: Boolean(existing?.id),
      activeShift: existing,
    };
  });

  app.post('/api/v1/shifts/open', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = openShiftSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.message);
    return withSyncIdempotency(
      {
        syncId: parsed.data.syncId,
        terminalId: request.terminal.id,
        eventType: SYNC_EVENT_TYPES.SHIFT_OPEN,
      },
      async () =>
        openShift({
          ...parsed.data,
          terminalId: request.terminal.id,
          venueId: request.terminal.venueId,
        }),
    );
  });

  app.post('/api/v1/shifts/close', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = closeShiftSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.message);
    return withSyncIdempotency(
      {
        syncId: parsed.data.syncId,
        terminalId: request.terminal.id,
        eventType: SYNC_EVENT_TYPES.SHIFT_CLOSE,
      },
      async () =>
        closeShift({
          ...parsed.data,
          terminalId: request.terminal.id,
          venueId: request.terminal.venueId,
        }),
    );
  });
}
