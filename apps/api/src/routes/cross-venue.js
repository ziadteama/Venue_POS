import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { emitCrossVenueBilled, emitOrderCreated } from '../plugins/socket.js';
import {
  getCrossVenueMenu,
  startCrossVenueOrder,
  addCrossVenueItem,
  addCrossVenueItemByCheque,
  editCrossVenueItemByCheque,
  removeCrossVenueItemByCheque,
  editCrossVenueItem,
  removeCrossVenueItem,
  fireCrossVenueGroup,
  getCrossVenueGroup,
  getCrossVenueGroupByAnchorCheque,
  cancelCrossVenueGroup,
  payCrossVenueGroup,
} from '../services/cross-venue-service.js';

const startOrderSchema = z.object({
  cashierId: z.string().uuid(),
  tableLabel: z.string().min(1).max(32).optional(),
});

const addItemSchema = z.object({
  cashierId: z.string().uuid(),
  venueId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive().max(99).optional(),
  modifiers: z
    .array(
      z.object({
        groupId: z.string().uuid(),
        optionId: z.string().uuid(),
        nameEn: z.string(),
        nameAr: z.string(),
        priceDelta: z.number().optional(),
      }),
    )
    .optional(),
});

const editItemSchema = z.object({
  quantity: z.number().int().positive().max(99),
});

const fireSchema = z.object({
  cashierId: z.string().uuid(),
  venueId: z.string().uuid().optional(),
});

const payGroupSchema = z.object({
  cashierId: z.string().uuid(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
  cardLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  tendered: z.number().positive().optional(),
  managerPin: z.string().min(4).max(6).optional(),
});

const cancelGroupSchema = z.object({
  cashierId: z.string().uuid().optional(),
});

export async function crossVenueRoutes(app) {
  app.get(
    '/api/v1/cross-venue/cheques/:chequeId/group',
    { preHandler: authenticateTerminal },
    async (request) => {
      const group = await getCrossVenueGroupByAnchorCheque(
        request.params.chequeId,
        request.terminal.venueId,
      );
      return group ?? { group: null };
    },
  );

  app.post(
    '/api/v1/cross-venue/cheques/:chequeId/items',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = addItemSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      return addCrossVenueItemByCheque({
        anchorChequeId: request.params.chequeId,
        venueId: parsed.data.venueId,
        anchorVenueId: request.terminal.venueId,
        anchorTerminalId: request.terminal.id,
        cashierId: parsed.data.cashierId,
        menuItemId: parsed.data.menuItemId,
        quantity: parsed.data.quantity,
        modifiers: parsed.data.modifiers,
      });
    },
  );

  app.patch(
    '/api/v1/cross-venue/cheques/:chequeId/items/:itemId',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = editItemSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = request.query?.venueId;
      if (!venueId || typeof venueId !== 'string') {
        throw validationError('venueId query parameter is required');
      }

      return editCrossVenueItemByCheque({
        anchorChequeId: request.params.chequeId,
        venueId,
        anchorVenueId: request.terminal.venueId,
        itemId: request.params.itemId,
        quantity: parsed.data.quantity,
      });
    },
  );

  app.delete(
    '/api/v1/cross-venue/cheques/:chequeId/items/:itemId',
    { preHandler: authenticateTerminal },
    async (request) => {
      const venueId = request.query?.venueId;
      if (!venueId || typeof venueId !== 'string') {
        throw validationError('venueId query parameter is required');
      }

      return removeCrossVenueItemByCheque({
        anchorChequeId: request.params.chequeId,
        venueId,
        anchorVenueId: request.terminal.venueId,
        itemId: request.params.itemId,
      });
    },
  );

  app.get(
    '/api/v1/cross-venue/menu/:venueId',
    { preHandler: authenticateTerminal },
    async (request) =>
      getCrossVenueMenu(request.terminal.venueId, request.params.venueId),
  );

  app.post(
    '/api/v1/cross-venue/order',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = startOrderSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      return startCrossVenueOrder({
        anchorVenueId: request.terminal.venueId,
        anchorTerminalId: request.terminal.id,
        cashierId: parsed.data.cashierId,
        tableLabel: parsed.data.tableLabel,
      });
    },
  );

  app.get(
    '/api/v1/cross-venue/order/:groupId',
    { preHandler: authenticateTerminal },
    async (request) => getCrossVenueGroup(request.params.groupId, request.terminal.venueId),
  );

  app.post(
    '/api/v1/cross-venue/order/:groupId/items',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = addItemSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      return addCrossVenueItem({
        groupId: request.params.groupId,
        venueId: parsed.data.venueId,
        anchorVenueId: request.terminal.venueId,
        anchorTerminalId: request.terminal.id,
        cashierId: parsed.data.cashierId,
        menuItemId: parsed.data.menuItemId,
        quantity: parsed.data.quantity,
        modifiers: parsed.data.modifiers,
      });
    },
  );

  app.patch(
    '/api/v1/cross-venue/order/:groupId/items/:itemId',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = editItemSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = request.query?.venueId;
      if (!venueId || typeof venueId !== 'string') {
        throw validationError('venueId query parameter is required');
      }

      return editCrossVenueItem({
        groupId: request.params.groupId,
        venueId,
        anchorVenueId: request.terminal.venueId,
        itemId: request.params.itemId,
        quantity: parsed.data.quantity,
      });
    },
  );

  app.delete(
    '/api/v1/cross-venue/order/:groupId/items/:itemId',
    { preHandler: authenticateTerminal },
    async (request) => {
      const venueId = request.query?.venueId;
      if (!venueId || typeof venueId !== 'string') {
        throw validationError('venueId query parameter is required');
      }

      return removeCrossVenueItem({
        groupId: request.params.groupId,
        venueId,
        anchorVenueId: request.terminal.venueId,
        itemId: request.params.itemId,
      });
    },
  );

  app.post(
    '/api/v1/cross-venue/order/:groupId/fire',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = fireSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const result = await fireCrossVenueGroup({
        groupId: request.params.groupId,
        anchorVenueId: request.terminal.venueId,
        anchorTerminalId: request.terminal.id,
        cashierId: parsed.data.cashierId,
        venueId: parsed.data.venueId,
      });

      if (request.server.io) {
        for (const order of result.sentOrders) {
          emitOrderCreated(request.server.io, order);
        }
      }
      return result;
    },
  );

  app.post(
    '/api/v1/cross-venue/order/:groupId/cancel',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = cancelGroupSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return cancelCrossVenueGroup(request.params.groupId, request.terminal.venueId, {
        cashierId: parsed.data.cashierId,
      });
    },
  );

  app.post(
    '/api/v1/cross-venue/order/:groupId/pay',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = payGroupSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const result = await payCrossVenueGroup({
        groupId: request.params.groupId,
        anchorVenueId: request.terminal.venueId,
        anchorTerminalId: request.terminal.id,
        cashierId: parsed.data.cashierId,
        method: parsed.data.method,
        cardLast4: parsed.data.cardLast4,
        tendered: parsed.data.tendered,
        managerPin: parsed.data.managerPin,
      });

      if (request.server.io) {
        emitCrossVenueBilled(request.server.io, {
          groupId: result.group.groupId,
          anchorVenueId: result.group.anchorVenueId,
          combinedTotal: result.combinedTotal,
          cheques: result.group.cheques.map((c) => ({
            id: c.id,
            venueId: c.venueId,
            total: c.total,
          })),
        });
      }
      return result;
    },
  );
}
