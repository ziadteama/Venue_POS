import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { emitOrderCreated } from '../plugins/socket.js';
import {
  openOrResumeCheque,
  listOpenCheques,
  getCheque,
  getChequeReceipt,
  fireChequeRound,
  clearChequeDraft,
  payCheque,
  splitChequeByItems,
  splitChequeByAmount,
  transferChequeItems,
  listChequesForVenue,
  closeEmptyCheque,
} from '../services/cheque-service.js';
import { applyChequeDiscount, requestChequeRefund } from '../services/manager-action-service.js';
import { emitManagerAction } from '../plugins/socket.js';

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

const openChequeSchema = z.object({
  cashierId: z.string().uuid(),
  tableLabel: z.string().min(1).max(50),
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
});

const discountSchema = z.object({
  cashierId: z.string().uuid(),
  restaurantManagerPin: z.string().min(4).max(6),
  reason: z.string().min(1).max(500),
  amount: z.number().positive().optional(),
  percent: z.number().positive().max(100).optional(),
});

const refundSchema = z.object({
  cashierId: z.string().uuid(),
  restaurantManagerPin: z.string().min(4).max(6),
  reason: z.string().min(1).max(500),
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
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
    return closeEmptyCheque(request.params.id, request.terminal.venueId);
  });

  app.get(
    '/api/v1/cheques/:id/receipt',
    { preHandler: authenticateTerminal },
    async (request) => {
      return getChequeReceipt(request.params.id, request.terminal.venueId);
    },
  );

  app.post('/api/v1/cheques/open', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = openChequeSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    return openOrResumeCheque({
      venueId: request.terminal.venueId,
      terminalId: request.terminal.id,
      cashierId: parsed.data.cashierId,
      tableLabel: parsed.data.tableLabel,
    });
  });

  app.post(
    '/api/v1/cheques/:id/fire',
    { preHandler: authenticateTerminal },
    async (request) => {
      const result = await fireChequeRound(request.params.id, request.terminal.venueId);
      if (request.server.io) {
        emitOrderCreated(request.server.io, result.sentOrder);
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

      return payCheque(
        request.params.id,
        { ...parsed.data, terminalId: request.terminal.id },
        request.terminal.venueId,
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
      const cheque = await applyChequeDiscount(request.params.id, parsed.data, venueId);
      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          type: 'discount',
          chequeId: request.params.id,
          result: cheque,
        });
      }
      return cheque;
    },
  );

  app.post(
    '/api/v1/cheques/:id/refund',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = request.terminal.venueId;
      const result = await requestChequeRefund(request.params.id, parsed.data, venueId, {
        terminalId: request.terminal.id,
      });
      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          terminalId: request.terminal.id,
          type: 'refund_request',
          chequeId: request.params.id,
          result,
        });
      }
      return result;
    },
  );
}
