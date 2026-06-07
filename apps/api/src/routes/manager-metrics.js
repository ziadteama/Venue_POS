import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { buildLiveMetrics } from '../services/metrics-service.js';

const hubOwnerPreHandler = requireRoles(ROLES.HUB_OWNER);

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
}

export async function managerMetricsRoutes(app) {
  app.get(
    '/api/v1/manager/metrics/live',
    { preHandler: hubOwnerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      return buildLiveMetrics({ venueId });
    },
  );
}
