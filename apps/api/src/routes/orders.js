import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { emitOrderCreated } from '../plugins/socket.js';
import {
  createOrder,
  addOrderItem,
  updateOrderItemQuantity,
  removeOrderItem,
  sendOrderToKitchen,
  getOrder,
  getOrderReceipt,
} from '../services/order-service.js';

const createOrderSchema = z.object({
  id: z.string().uuid().optional(),
  cashierId: z.string().uuid(),
  tableLabel: z.string().max(50).optional(),
});

const addItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
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

const qtySchema = z.object({
  quantity: z.number().int().min(0),
});

async function assertOrderVenue(request, orderId) {
  const order = await getOrder(orderId);
  if (order.venueId !== request.terminal.venueId) {
    throw validationError('Order not found for this terminal');
  }
  return order;
}

export async function orderRoutes(app) {
  app.post('/api/v1/orders', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    return createOrder({
      id: parsed.data.id,
      venueId: request.terminal.venueId,
      terminalId: request.terminal.id,
      cashierId: parsed.data.cashierId,
      tableLabel: parsed.data.tableLabel,
    });
  });

  app.get('/api/v1/orders/:id', { preHandler: authenticateTerminal }, async (request) => {
    return assertOrderVenue(request, request.params.id);
  });

  app.get('/api/v1/orders/:id/receipt', { preHandler: authenticateTerminal }, async (request) => {
    await assertOrderVenue(request, request.params.id);
    const text = await getOrderReceipt(request.params.id);
    return { text };
  });

  app.post('/api/v1/orders/:id/items', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = addItemSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
    await assertOrderVenue(request, request.params.id);
    return addOrderItem(request.params.id, parsed.data);
  });

  app.patch(
    '/api/v1/orders/:id/items/:itemId',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = qtySchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      await assertOrderVenue(request, request.params.id);
      return updateOrderItemQuantity(
        request.params.id,
        request.params.itemId,
        parsed.data.quantity,
      );
    },
  );

  app.delete(
    '/api/v1/orders/:id/items/:itemId',
    { preHandler: authenticateTerminal },
    async (request) => {
      await assertOrderVenue(request, request.params.id);
      return removeOrderItem(request.params.id, request.params.itemId);
    },
  );

  app.post(
    '/api/v1/orders/:id/send',
    { preHandler: authenticateTerminal },
    async (request) => {
      await assertOrderVenue(request, request.params.id);
      const order = await sendOrderToKitchen(request.params.id);
      if (request.server.io) {
        emitOrderCreated(request.server.io, order);
      }
      return order;
    },
  );
}
