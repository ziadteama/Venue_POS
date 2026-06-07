import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { buildLiveMetrics } from '../services/metrics-service.js';

const managerPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER);

function resolveVenueFilter(request) {
  const queryVenue = request.query?.venueId;
  if (queryVenue && request.user.role === ROLES.HUB_MANAGER) return queryVenue;
  if (request.user.role === ROLES.VENUE_MANAGER) return request.user.venue_id;
  return undefined;
}

export async function managerMetricsRoutes(app) {
  app.get(
    '/api/v1/manager/metrics/live',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      if (request.user.role === ROLES.VENUE_MANAGER && !venueId) {
        throw validationError('Venue is required');
      }
      return buildLiveMetrics({ venueId });
    },
  );
}
