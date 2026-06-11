import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { menuRoutes } from './routes/menus.js';
import { orderRoutes } from './routes/orders.js';
import { chequeRoutes } from './routes/cheques.js';
import { crossVenueRoutes } from './routes/cross-venue.js';
import { managerChequeRoutes } from './routes/manager-cheques.js';
import { managerActivityRoutes } from './routes/manager-activity.js';
import { shiftRoutes } from './routes/shifts.js';
import { featureRoutes } from './routes/features.js';
import { kitchenRoutes } from './routes/kitchen.js';
import { venueRoutes } from './routes/venues.js';
import { managerMetricsRoutes } from './routes/manager-metrics.js';
import { managerAnalyticsRoutes } from './routes/manager-analytics.js';
import { managerOrderRoutes } from './routes/manager-orders.js';
import { managerShiftsRoutes } from './routes/manager-shifts.js';
import { managerVenueConfigRoutes } from './routes/manager-venue-config.js';
import { managerHubTableRoutes } from './routes/manager-hub-tables.js';
import { managerHubBillingRoutes } from './routes/manager-hub-billing.js';
import { managerBillingRoutes } from './routes/manager-billing.js';
import { managerUsersRoutes } from './routes/manager-users.js';
import { managerAuditRoutes } from './routes/manager-audit.js';
import { managerHealthRoutes } from './routes/manager-health.js';
import { terminalRoutes } from './routes/terminals.js';
import { terminalOrderExplorerRoutes } from './routes/terminal-order-explorer.js';
import { syncRoutes } from './routes/sync.js';
import { floorRoutes } from './routes/floor.js';
import { managerDashboardRoutes } from './routes/manager-dashboard.js';
import { managerTerminalRoutes } from './routes/manager-terminals.js';
import { opsRoutes } from './routes/ops.js';
import { managerHubSettingsRoutes } from './routes/manager-hub-settings.js';

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
  await app.register(crossVenueRoutes);
  await app.register(managerChequeRoutes);
  await app.register(managerActivityRoutes);
  await app.register(shiftRoutes);
  await app.register(featureRoutes);
  await app.register(kitchenRoutes);
  await app.register(venueRoutes);
  await app.register(managerMetricsRoutes);
  await app.register(managerAnalyticsRoutes);
  await app.register(managerOrderRoutes);
  await app.register(managerShiftsRoutes);
  await app.register(managerVenueConfigRoutes);
  await app.register(managerHubTableRoutes);
  await app.register(managerHubBillingRoutes);
  await app.register(managerBillingRoutes);
  await app.register(managerUsersRoutes);
  await app.register(managerAuditRoutes);
  await app.register(managerHealthRoutes);
  await app.register(terminalRoutes);
  await app.register(terminalOrderExplorerRoutes);
  await app.register(syncRoutes);
  await app.register(floorRoutes);
  await app.register(managerDashboardRoutes);
  await app.register(managerTerminalRoutes);
  await app.register(opsRoutes);
  await app.register(managerHubSettingsRoutes);

  return app;
}
