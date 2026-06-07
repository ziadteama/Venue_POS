import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { getSystemHealth, healthSnapshotToCsv } from '../services/manager-health-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
}

export async function managerHealthRoutes(app) {
  app.get(
    '/api/v1/manager/health',
    { preHandler: hubManagerPreHandler },
    async (request, reply) => {
      const venueId = resolveVenueFilter(request);
      const snapshot = await getSystemHealth(venueId, request.server.io);

      if (request.query?.format === 'csv') {
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="system-health.csv"');
        return healthSnapshotToCsv(snapshot);
      }
      return snapshot;
    },
  );
}
