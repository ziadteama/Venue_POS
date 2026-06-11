import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import {
  buildExecutiveDashboard,
  buildOperationsDashboard,
  listRefundsToday,
} from '../services/dashboard-summary-service.js';
import {
  userCanSeeFinancials,
  redactExecutiveDashboardFinancials,
  redactRefundsTodayList,
} from '../services/financial-redact.js';

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
}

function resolveRefundMetric(request) {
  const metric = request.query?.metric;
  return metric === 'eod' ? 'eod' : 'calendar';
}

async function handleRefundsToday(request) {
  const venueId = resolveVenueFilter(request);
  const metric = resolveRefundMetric(request);
  const result = await listRefundsToday({ venueId, metric });
  if (request.user.role === ROLES.HUB_OWNER && !userCanSeeFinancials(request.user)) {
    return redactRefundsTodayList(result);
  }
  return result;
}

export async function managerDashboardRoutes(app) {
  app.get(
    '/api/v1/manager/dashboard/executive',
    { preHandler: requireRoles(ROLES.HUB_OWNER) },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      const result = await buildExecutiveDashboard({ venueId }, request.server.io);
      if (!userCanSeeFinancials(request.user)) {
        return redactExecutiveDashboardFinancials(result);
      }
      return result;
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

  app.get(
    '/api/v1/manager/dashboard/refunds-today',
    { preHandler: requireRoles(ROLES.HUB_OWNER, ROLES.HUB_MANAGER) },
    async (request) => handleRefundsToday(request),
  );
}
