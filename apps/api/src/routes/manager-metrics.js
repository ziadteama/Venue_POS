import { requireFinancialOwner } from '../middleware/auth.js';
import { buildLiveMetrics } from '../services/metrics-service.js';

const financialOwnerPreHandler = requireFinancialOwner();

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
}

export async function managerMetricsRoutes(app) {
  app.get(
    '/api/v1/manager/metrics/live',
    { preHandler: financialOwnerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      return buildLiveMetrics({ venueId });
    },
  );
}
