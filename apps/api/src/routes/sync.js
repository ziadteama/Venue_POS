import { z } from 'zod';
import { MAX_SYNC_BATCH, SYNC_EVENT_TYPES } from '@venue-pos/shared';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { withSyncIdempotency } from '../services/sync-idempotency.js';
import {
  openOrResumeCheque,
  fireChequeRound,
  payCheque,
  clearChequeDraft,
  closeEmptyCheque,
  moveChequeTable,
  splitChequeByItems,
  transferChequeItems,
} from '../services/cheque-service.js';
import { replayCrossVenueGroup } from '../services/cross-venue-service.js';
import { executeChequeDiscount } from '../services/cheque-discount.js';
import { verifyManagerPin } from '../services/auth-service.js';
import { payCrossVenueGroup } from '../services/cross-venue-service.js';
import { openShift, closeShift } from '../services/shift-service.js';
import { voidOrder } from '../services/order-service.js';

const eventSchema = z.object({
  syncId: z.string().uuid(),
  eventType: z.string().min(1),
  payload: z.record(z.unknown()),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(MAX_SYNC_BATCH),
});

export async function syncRoutes(app) {
  app.post('/api/v1/sync/events', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = batchSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    const results = [];
    for (const event of parsed.data.events) {
      const result = await processSyncEvent(request, event);
      results.push({ syncId: event.syncId, eventType: event.eventType, result });
    }
    return { processed: results.length, results };
  });
}

async function processSyncEvent(request, { syncId, eventType, payload }) {
  const venueId = request.terminal.venueId;
  const terminalId = request.terminal.id;

  return withSyncIdempotency({ syncId, terminalId, eventType }, async () => {
    switch (eventType) {
      case SYNC_EVENT_TYPES.CHEQUE_OPEN:
        return openOrResumeCheque({
          venueId,
          terminalId,
          cashierId: payload.cashierId,
          tableLabel: payload.tableLabel,
        });
      case SYNC_EVENT_TYPES.CHEQUE_FIRE:
        return fireChequeRound(payload.chequeId ?? payload.id, venueId);
      case SYNC_EVENT_TYPES.CHEQUE_PAY:
        return payCheque(
          payload.chequeId ?? payload.id,
          { ...(payload.payBody ?? payload), terminalId },
          venueId,
        );
      case SYNC_EVENT_TYPES.CHEQUE_DISCOUNT: {
        const body = payload.body ?? payload;
        const manager = await verifyManagerPin(venueId, body.restaurantManagerPin);
        return executeChequeDiscount(
          payload.chequeId ?? payload.id,
          {
            amount: body.amount,
            percent: body.percent,
            reason: body.reason,
            cashierId: body.cashierId,
            initiatorId: body.cashierId,
            approverId: manager.id,
          },
          venueId,
        );
      }
      case SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_PAY:
        return payCrossVenueGroup({
          anchorChequeId: payload.anchorChequeId,
          anchorVenueId: venueId,
          payments: payload.payments,
          cashierId: payload.cashierId,
          terminalId,
        });
      case SYNC_EVENT_TYPES.SHIFT_OPEN:
        return openShift({
          cashierId: payload.cashierId,
          openFloat: payload.openFloat,
          terminalId,
          venueId,
        });
      case SYNC_EVENT_TYPES.SHIFT_CLOSE:
        return closeShift({
          cashierId: payload.cashierId,
          closeFloat: payload.closeFloat,
          managerPin: payload.managerPin,
          terminalId,
          venueId,
        });
      case SYNC_EVENT_TYPES.ORDER_VOID:
        return voidOrder(payload.orderId, {
          cashierId: payload.cashierId,
          managerPin: payload.managerPin,
          reason: payload.reason,
        }, venueId);
      case SYNC_EVENT_TYPES.CHEQUE_VOID:
        return closeEmptyCheque(payload.chequeId ?? payload.id, venueId);
      case SYNC_EVENT_TYPES.CHEQUE_CLEAR:
        return clearChequeDraft(payload.chequeId ?? payload.id, venueId);
      case SYNC_EVENT_TYPES.CHEQUE_TABLE_MOVE:
        return moveChequeTable(
          payload.chequeId ?? payload.id,
          { targetTableLabel: payload.targetTableLabel },
          venueId,
          { terminalId },
        );
      case SYNC_EVENT_TYPES.CHEQUE_TRANSFER: {
        const body = payload.body ?? payload;
        return transferChequeItems(
          payload.chequeId ?? payload.id,
          body,
          venueId,
          terminalId,
        );
      }
      case SYNC_EVENT_TYPES.CHEQUE_SPLIT:
        return splitChequeByItems(
          payload.chequeId ?? payload.id,
          { splits: payload.splits },
          venueId,
        );
      case SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_REPLAY:
        return replayCrossVenueGroup({
          ...payload,
          anchorVenueId: payload.anchorVenueId ?? venueId,
          anchorTerminalId: payload.anchorTerminalId ?? terminalId,
        });
      default:
        throw validationError(`Unsupported sync event type: ${eventType}`);
    }
  });
}
