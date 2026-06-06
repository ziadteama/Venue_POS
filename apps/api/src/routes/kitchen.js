import { config } from '../config.js';
import { authenticateTerminal } from '../middleware/terminal.js';
import { listKitchenOrders } from '../services/order-service.js';
import { forbidden } from '../utils/errors.js';

export async function kitchenRoutes(app) {
  app.get('/api/v1/kitchen/orders', { preHandler: authenticateTerminal }, async (request) => {
    if (!config.featureKdsEnabled) {
      throw forbidden('Kitchen display is disabled for this deployment');
    }
    return listKitchenOrders(request.terminal.venueId);
  });
}
