import { z } from 'zod';
import { config } from '../config.js';
import { authenticateTerminal } from '../middleware/terminal.js';
import { listKitchenOrders, updateKitchenItemStatus } from '../services/order-service.js';
import { emitOrderItemStatus } from '../plugins/socket.js';
import { forbidden, validationError } from '../utils/errors.js';

const itemStatusSchema = z.object({
  status: z.enum(['in_progress', 'ready', 'served']),
});

export async function kitchenRoutes(app) {
  app.get('/api/v1/kitchen/orders', { preHandler: authenticateTerminal }, async (request) => {
    if (!config.featureKdsEnabled) {
      throw forbidden('Kitchen display is disabled for this deployment');
    }
    return listKitchenOrders(request.terminal.venueId);
  });

  app.patch(
    '/api/v1/kitchen/orders/:orderId/items/:itemId/status',
    { preHandler: authenticateTerminal },
    async (request) => {
      if (!config.featureKdsEnabled) {
        throw forbidden('Kitchen display is disabled for this deployment');
      }
      const parsed = itemStatusSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const result = await updateKitchenItemStatus(
        request.params.orderId,
        request.params.itemId,
        parsed.data.status,
        request.terminal.venueId,
      );

      if (request.server.io) {
        emitOrderItemStatus(request.server.io, {
          order: result.order,
          itemId: result.itemId,
          kitchenStatus: result.kitchenStatus,
          updatedBy: request.terminal.id,
        });
      }

      return result.order;
    },
  );
}
