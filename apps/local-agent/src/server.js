import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerHealthRoutes } from './routes/health.js';
import { registerMenuRoutes } from './routes/menu.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerChequeRoutes } from './routes/cheques.js';
import { registerShiftRoutes } from './routes/shifts.js';
import { registerFeatureRoutes } from './routes/features.js';

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
  };

  registerHealthRoutes(app, routeCtx);
  registerMenuRoutes(app, routeCtx);
  registerSyncRoutes(app, routeCtx);
  registerOrderRoutes(app, routeCtx);
  registerChequeRoutes(app, routeCtx);
  registerShiftRoutes(app, routeCtx);
  registerFeatureRoutes(app, routeCtx);

  await app.listen({ port, host });
  return app;
}
