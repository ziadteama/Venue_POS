import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { emitOrderCreated } from '../plugins/socket.js';
import {
  openOrResumeCheque,
  listOpenCheques,
  getCheque,
  getChequeReceipt,
  getSplitReceiptBundle,
  fireChequeRound,
  clearChequeDraft,
  payCheque,
  splitChequeByItems,
  splitChequeByAmount,
  transferChequeItems,
  listChequesForVenue,
  closeEmptyCheque,
  moveChequeTable,
  adjustPrePaymentItemQty,
  recordCheckPrint,
} from '../services/cheque-service.js';
import {
  applyChequeDiscount,
  applyChequeRefund,
  changeChequeDiscount,
  removeAppliedChequeDiscount,
} from '../services/manager-action-service.js';
import { emitManagerAction, emitRefundNotification, emitDiscountNotification } from '../plugins/socket.js';
import { withSyncIdempotency } from '../services/sync-idempotency.js';
import { occupyFloorTable, releaseFloorTable } from '../services/floor-table-service.js';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';

const splitAmountSchema = z.object({
  splits: z
    .array(
      z.object({
        label: z.string().min(1).max(50),
        amount: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .max(8),
});

const transferItemsSchema = z.object({
  cashierId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1),
  targetChequeId: z.string().uuid().optional(),
  targetTableLabel: z.string().min(1).max(50).optional(),
  managerPin: z.string().min(4).max(6),
  reason: z.string().max(500).optional(),
});

const splitChequeSchema = z.object({
  splits: z
    .array(
      z.object({
        label: z.string().min(1).max(50),
        itemIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .min(1)
    .max(8),
});

const openChequeSchema = z
  .object({
    cashierId: z.string().uuid(),
    serviceMode: z.enum(['dine_in', 'takeaway']).default('dine_in'),
    tableLabel: z.string().min(1).max(50).optional(),
    syncId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.serviceMode === 'dine_in' && !data.tableLabel?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tableLabel is required for dine-in',
        path: ['tableLabel'],
      });
    }
  });

const paymentLineSchema = z.object({
  method: z.enum(['cash', 'card', 'voucher']),
  amount: z.number().positive(),
  cardLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

const payChequeSchema = z.object({
  cashierId: z.string().uuid(),
  payments: z.array(paymentLineSchema).min(1).max(5).optional(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
  amount: z.number().positive().optional(),
  tendered: z.number().positive().optional(),
  managerPin: z.string().min(4).max(6).optional(),
  syncId: z.string().uuid().optional(),
});

const discountSchema = z.object({
  cashierId: z.string().uuid(),
  restaurantManagerPin: z.string().min(4).max(6).optional(),
  reason: z.string().min(1).max(500),
  amount: z.number().positive().optional(),
  percent: z.number().positive().max(100).optional(),
});

const removeDiscountSchema = z.object({
  cashierId: z.string().uuid(),
  restaurantManagerPin: z.string().min(4).max(6).optional(),
  reason: z.string().min(1).max(500),
});

const refundSchema = z.object({
  cashierId: z.string().uuid(),
  restaurantManagerPin: z.string().min(4).max(6).optional(),
  reason: z.string().min(1).max(500),
  amount: z.coerce.number().positive(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
});

const checkPrintSchema = z.object({
  cashierId: z.string().uuid(),
  syncId: z.string().uuid().optional(),
});

const prePayAdjustSchema = z.object({
  quantity: z.number().int().min(0),
  cashierId: z.string().uuid(),
  syncId: z.string().uuid().optional(),
});

export async function chequeRoutes(app) {
  app.get('/api/v1/cheques/open', { preHandler: authenticateTerminal }, async (request) => {
    return listOpenCheques(request.terminal.venueId);
  });

  app.get('/api/v1/cheques/paid', { preHandler: authenticateTerminal }, async (request) => {
    const limit = Number(request.query?.limit ?? 30);
    return listChequesForVenue(request.terminal.venueId, { status: 'paid', limit });
  });

  app.get('/api/v1/cheques/:id', { preHandler: authenticateTerminal }, async (request) => {
    return getCheque(request.params.id, request.terminal.venueId);
  });

  app.delete('/api/v1/cheques/:id', { preHandler: authenticateTerminal }, async (request) => {
    const result = await closeEmptyCheque(request.params.id, request.terminal.venueId);
    if (result.tableLabel && result.serviceMode !== 'takeaway' && result.floorTableId) {
      await releaseFloorTable({
        tableLabel: result.tableLabel,
        floorTableId: result.floorTableId,
        chequeId: result.id,
        io: request.server.io,
      });
    }
    return result;
  });

  app.get(
    '/api/v1/cheques/:id/receipt',
    { preHandler: authenticateTerminal },
    async (request) => {
      const preview = request.query?.preview === 'true' || request.query?.preview === '1';
      return getChequeReceipt(request.params.id, request.terminal.venueId, { preview });
    },
  );

  app.get(
    '/api/v1/cheques/:id/receipt-bundle',
    { preHandler: authenticateTerminal },
    async (request) => {
      return getSplitReceiptBundle(request.params.id, request.terminal.venueId);
    },
  );

  app.post(
    '/api/v1/cheques/:id/check-print',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = checkPrintSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      return withSyncIdempotency(
        {
          syncId: parsed.data.syncId,
          terminalId: request.terminal.id,
          eventType: SYNC_EVENT_TYPES.CHEQUE_CHECK_PRINT,
        },
        async () =>
          recordCheckPrint(
            request.params.id,
            {
              cashierId: parsed.data.cashierId,
              terminalId: request.terminal.id,
            },
            request.terminal.venueId,
          ),
      );
    },
  );

  app.patch(
    '/api/v1/cheques/:chequeId/orders/:orderId/items/:itemId',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = prePayAdjustSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      return withSyncIdempotency(
        {
          syncId: parsed.data.syncId,
          terminalId: request.terminal.id,
          eventType: SYNC_EVENT_TYPES.CHEQUE_PRE_PAY_ADJUST,
        },
        async () =>
          adjustPrePaymentItemQty(
            request.params.chequeId,
            request.params.orderId,
            request.params.itemId,
            parsed.data.quantity,
            {
              cashierId: parsed.data.cashierId,
              terminalId: request.terminal.id,
            },
            request.terminal.venueId,
          ),
      );
    },
  );

  app.post('/api/v1/cheques/open', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = openChequeSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    const result = await withSyncIdempotency(
      {
        syncId: parsed.data.syncId,
        terminalId: request.terminal.id,
        eventType: SYNC_EVENT_TYPES.CHEQUE_OPEN,
      },
      async () =>
        openOrResumeCheque({
          venueId: request.terminal.venueId,
          terminalId: request.terminal.id,
          cashierId: parsed.data.cashierId,
          tableLabel: parsed.data.tableLabel,
          serviceMode: parsed.data.serviceMode,
        }),
    );

    if (result.serviceMode !== 'takeaway') {
      await occupyFloorTable({
        tableLabel: result.tableLabel ?? parsed.data.tableLabel,
        floorTableId: result.floorTableId,
        venueId: request.terminal.venueId,
        chequeId: result.id,
        crossVenueGroupId: result.crossVenueGroupId,
        terminalId: request.terminal.id,
        io: request.server.io,
      });
    }

    return result;
  });

  app.post(
    '/api/v1/cheques/:id/fire',
    { preHandler: authenticateTerminal },
    async (request) => {
      const result = await fireChequeRound(request.params.id, request.terminal.venueId);
      if (request.server.io) {
        const sent = result.sentOrders?.length ? result.sentOrders : [result.sentOrder].filter(Boolean);
        for (const order of sent) {
          emitOrderCreated(request.server.io, order);
        }
      }
      return result;
    },
  );

  app.post(
    '/api/v1/cheques/:id/clear',
    { preHandler: authenticateTerminal },
    async (request) => {
      return clearChequeDraft(request.params.id, request.terminal.venueId);
    },
  );

  app.post(
    '/api/v1/cheques/:id/pay',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = payChequeSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const result = await withSyncIdempotency(
        {
          syncId: parsed.data.syncId,
          terminalId: request.terminal.id,
          eventType: SYNC_EVENT_TYPES.CHEQUE_PAY,
        },
        async () =>
          payCheque(
            request.params.id,
            { ...parsed.data, terminalId: request.terminal.id },
            request.terminal.venueId,
          ),
      );

      const rootId = result?.cheque?.parentChequeId ?? result?.cheque?.id ?? request.params.id;
      if (
        result?.tableSettled &&
        result?.cheque?.tableLabel &&
        result.cheque.serviceMode !== 'takeaway' &&
        result.cheque.floorTableId
      ) {
        await releaseFloorTable({
          tableLabel: result.cheque.tableLabel,
          floorTableId: result.cheque.floorTableId,
          chequeId: rootId,
          io: request.server.io,
        });
      }

      return result;
    },
  );

  app.patch(
    '/api/v1/cheques/:id/table',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = z
        .object({ targetTableLabel: z.string().min(1).max(50) })
        .safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      return moveChequeTable(
        request.params.id,
        { targetTableLabel: parsed.data.targetTableLabel },
        request.terminal.venueId,
        { terminalId: request.terminal.id, io: request.server.io },
      );
    },
  );

  app.post(
    '/api/v1/cheques/:id/split',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = splitChequeSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      return splitChequeByItems(request.params.id, parsed.data, request.terminal.venueId);
    },
  );

  app.post(
    '/api/v1/cheques/:id/split-amount',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = splitAmountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      return splitChequeByAmount(request.params.id, parsed.data, request.terminal.venueId);
    },
  );

  app.post(
    '/api/v1/cheques/:id/transfer',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = transferItemsSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      if (!parsed.data.targetChequeId && !parsed.data.targetTableLabel) {
        throw validationError('targetChequeId or targetTableLabel required');
      }

      const venueId = request.terminal.venueId;
      const result = await transferChequeItems(
        request.params.id,
        parsed.data,
        venueId,
        request.terminal.id,
      );
      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          type: 'transfer',
          chequeId: request.params.id,
          result,
        });
      }
      return result;
    },
  );

  app.post(
    '/api/v1/cheques/:id/discount',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = discountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      if (!parsed.data.amount && !parsed.data.percent) {
        throw validationError('amount or percent required');
      }

      const venueId = request.terminal.venueId;
      const result = await applyChequeDiscount(request.params.id, parsed.data, venueId);
      if (request.server.io) {
        emitDiscountNotification(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          chequeNumber: result.chequeNumber,
          action: 'discount',
          amount: result.discountAmount,
          reason: parsed.data.reason,
          source: 'pos',
        });
        emitManagerAction(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          type: 'discount',
          chequeId: request.params.id,
          result,
        });
      }
      return result;
    },
  );

  app.patch(
    '/api/v1/cheques/:id/discount',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = discountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      if (!parsed.data.amount && !parsed.data.percent) {
        throw validationError('amount or percent required');
      }

      const venueId = request.terminal.venueId;
      const result = await changeChequeDiscount(request.params.id, parsed.data, venueId);
      if (request.server.io) {
        emitDiscountNotification(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          chequeNumber: result.chequeNumber,
          action: 'discount_change',
          amount: result.discountAmount,
          reason: parsed.data.reason,
          source: 'pos',
        });
        emitManagerAction(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          type: 'discount_change',
          chequeId: request.params.id,
          result,
        });
      }
      return result;
    },
  );

  app.post(
    '/api/v1/cheques/:id/discount/remove',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = removeDiscountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = request.terminal.venueId;
      const result = await removeAppliedChequeDiscount(request.params.id, parsed.data, venueId);
      if (request.server.io) {
        emitDiscountNotification(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          chequeNumber: result.chequeNumber,
          action: 'discount_remove',
          amount: result.discountAmount,
          reason: parsed.data.reason,
          source: 'pos',
        });
        emitManagerAction(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          type: 'discount_remove',
          chequeId: request.params.id,
          result,
        });
      }
      return result;
    },
  );

  app.post(
    '/api/v1/cheques/:id/refund',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = request.terminal.venueId;
      const result = await applyChequeRefund(request.params.id, parsed.data, venueId, {
        terminalId: request.terminal.id,
      });
      if (request.server.io) {
        emitRefundNotification(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          chequeNumber: result.cheque?.chequeNumber,
          amount: result.refund?.amount,
          method: result.refund?.method,
          reason: parsed.data.reason,
          managerName: result.manager?.username,
          cashierName: result.cashier?.username,
          source: 'pos',
        });
        emitManagerAction(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          type: 'refund',
          chequeId: request.params.id,
          result,
        });
      }
      return result;
    },
  );
}
