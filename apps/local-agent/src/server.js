import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerHealthRoutes } from './routes/health.js';
import { registerMenuRoutes } from './routes/menu.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerChequeRoutes } from './routes/cheques.js';
import { registerCrossVenueRoutes } from './routes/cross-venue.js';
import { registerShiftRoutes } from './routes/shifts.js';
import { registerFeatureRoutes } from './routes/features.js';
import { registerOrderExplorerRoutes } from './routes/order-explorer.js';
import { registerFloorRoutes } from './routes/floor.js';

export async function buildAgentServer({ db, config }) {
  const app = Fastify({ logger: { level: 'info' } });
  const {
    port,
    host,
    apiUrl,
    venueId,
    terminalId,
    terminalSecret,
    corsOrigins,
    getPrinterConfig,
    autoReceiptPrint,
    isCoordinator,
    coordinatorMode,
    coordinatorLanHost = '',
    coordinatorFallback = false,
  } = config;

  await app.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type'],
  });

  const routeCtx = {
    db,
    apiUrl,
    venueId,
    terminalId,
    terminalSecret,
    getPrinterConfig,
    autoReceiptPrint,
    isCoordinator,
    coordinatorMode,
    coordinatorLanHost,
    coordinatorFallback,
  };

  registerHealthRoutes(app, routeCtx);
  registerFloorRoutes(app, routeCtx);
  registerMenuRoutes(app, routeCtx);
  registerSyncRoutes(app, routeCtx);
  registerOrderRoutes(app, routeCtx);
  registerChequeRoutes(app, routeCtx);
  registerCrossVenueRoutes(app, routeCtx);
  registerShiftRoutes(app, routeCtx);
  registerFeatureRoutes(app, routeCtx);
  registerOrderExplorerRoutes(app, routeCtx);

  await app.listen({ port, host });
  return app;
}
