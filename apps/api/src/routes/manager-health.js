import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { getSystemHealth, healthSnapshotToCsv } from '../services/manager-health-service.js';

const managerPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER);

function resolveVenueFilter(request) {
  const queryVenue = request.query?.venueId;
  if (queryVenue && request.user.role === ROLES.HUB_MANAGER) return queryVenue;
  if (request.user.role === ROLES.VENUE_MANAGER) return request.user.venue_id;
  return undefined;
}

export async function managerHealthRoutes(app) {
  app.get(
    '/api/v1/manager/health',
    { preHandler: managerPreHandler },
    async (request, reply) => {
      const venueId = resolveVenueFilter(request);
      if (request.user.role === ROLES.VENUE_MANAGER && !venueId) {
        throw validationError('Venue is required');
      }

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
