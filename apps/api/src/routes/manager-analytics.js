import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import {
  buildRevenueAnalytics,
  revenueAnalyticsToCsv,
} from '../services/analytics-service.js';

const hubOwnerPreHandler = requireRoles(ROLES.HUB_OWNER);

const presetSchema = z.enum([
  'today',
  'yesterday',
  'week',
  'last_week',
  'month',
  'last_month',
  'custom',
]);

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
}

export async function managerAnalyticsRoutes(app) {
  app.get(
    '/api/v1/manager/analytics/revenue',
    { preHandler: hubOwnerPreHandler },
    async (request, reply) => {
      const preset = request.query?.preset ?? 'today';
      if (!presetSchema.safeParse(preset).success) {
        throw validationError('Invalid preset');
      }

      const venueId = resolveVenueFilter(request);

      const report = await buildRevenueAnalytics({
        venueId,
        preset,
        from: request.query?.from,
        to: request.query?.to,
        categoryId: request.query?.categoryId,
        compare: request.query?.compare !== 'false',
      });

      if (request.query?.format === 'csv') {
        const csv = revenueAnalyticsToCsv(report);
        reply.header('content-type', 'text/csv; charset=utf-8');
        reply.header(
          'content-disposition',
          `attachment; filename="revenue-${preset}-${Date.now()}.csv"`,
        );
        return reply.send(csv);
      }

      return report;
    },
  );
}
