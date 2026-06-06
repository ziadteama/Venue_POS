import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { menuRoutes } from './routes/menus.js';
import { orderRoutes } from './routes/orders.js';
import { chequeRoutes } from './routes/cheques.js';
import { managerChequeRoutes } from './routes/manager-cheques.js';
import { kitchenRoutes } from './routes/kitchen.js';
import { venueRoutes } from './routes/venues.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.logLevel },
    genReqId: () => crypto.randomUUID(),
  });

  // Decorate on root so encapsulated route plugins can access request.server.io
  app.decorate('io', null);

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  registerErrorHandler(app);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(menuRoutes);
  await app.register(orderRoutes);
  await app.register(chequeRoutes);
  await app.register(managerChequeRoutes);
  await app.register(kitchenRoutes);
  await app.register(venueRoutes);

  return app;
}
