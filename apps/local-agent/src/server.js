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
import { registerAuthRoutes } from './routes/auth.js';
import { registerPeerRoutes, registerRelayRoutes } from './routes/peer.js';

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
    getCoordinatorLanHost,
    coordinatorFallback = false,
    getClusterState,
    clusterManager,
    getOwnLanHost,
    getDeviceProfile,
    lanPort = 3456,
    lanSecret = '',
  } = config;

  await app.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-agent-lan-secret', 'x-terminal-id', 'x-terminal-secret'],
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
    getCoordinatorLanHost,
    coordinatorFallback,
    getClusterState,
    getDeviceProfile,
    lanPort,
    lanSecret,
  };

  registerHealthRoutes(app, { ...routeCtx, clusterManager });
  registerAuthRoutes(app, routeCtx);
  registerFloorRoutes(app, routeCtx);
  registerMenuRoutes(app, routeCtx);
  registerSyncRoutes(app, routeCtx);
  registerOrderRoutes(app, routeCtx);
  registerChequeRoutes(app, routeCtx);
  registerCrossVenueRoutes(app, routeCtx);
  registerShiftRoutes(app, { db, apiUrl, terminalId, terminalSecret });
  registerFeatureRoutes(app, routeCtx);
  registerOrderExplorerRoutes(app, routeCtx);

  if (clusterManager) {
    registerPeerRoutes(app, { clusterManager, getOwnLanHost });
    registerRelayRoutes(app, { apiUrl });
  }

  await app.listen({ port, host });
  return app;
}
