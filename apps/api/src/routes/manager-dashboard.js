import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import {
  buildExecutiveDashboard,
  buildOperationsDashboard,
} from '../services/dashboard-summary-service.js';

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
}

export async function managerDashboardRoutes(app) {
  app.get(
    '/api/v1/manager/dashboard/executive',
    { preHandler: requireRoles(ROLES.HUB_OWNER) },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      return buildExecutiveDashboard({ venueId });
    },
  );

  app.get(
    '/api/v1/manager/dashboard/operations',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      return buildOperationsDashboard({ venueId }, request.server.io);
    },
  );
}
