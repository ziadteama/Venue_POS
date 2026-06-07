import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import {
  listManagerShifts,
  getManagerShiftDetail,
  managerForceCloseShift,
  shiftsListToCsv,
} from '../services/manager-shift-service.js';

const managerPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER);

function resolveVenueFilter(request) {
  const queryVenue = request.query?.venueId;
  if (queryVenue && request.user.role === ROLES.HUB_MANAGER) return queryVenue;
  if (request.user.role === ROLES.VENUE_MANAGER) return request.user.venue_id;
  return undefined;
}

export async function managerShiftsRoutes(app) {
  app.get(
    '/api/v1/manager/shifts',
    { preHandler: managerPreHandler },
    async (request, reply) => {
      const venueId = resolveVenueFilter(request);
      if (request.user.role === ROLES.VENUE_MANAGER && !venueId) {
        throw validationError('Venue is required');
      }

      const result = await listManagerShifts({
        venueId,
        status: request.query?.status,
        cashier: request.query?.cashier,
        from: request.query?.from,
        to: request.query?.to,
        page: request.query?.page,
        limit: request.query?.limit,
      });

      if (request.query?.format === 'csv') {
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header(
          'Content-Disposition',
          'attachment; filename="shifts-export.csv"',
        );
        return shiftsListToCsv(result);
      }

      return result;
    },
  );

  app.get(
    '/api/v1/manager/shifts/:id',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      if (request.user.role === ROLES.VENUE_MANAGER && !venueId) {
        throw validationError('Venue is required');
      }
      return getManagerShiftDetail(request.params.id, venueId);
    },
  );

  app.post(
    '/api/v1/manager/shifts/:id/force-close',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      if (request.user.role === ROLES.VENUE_MANAGER && !venueId) {
        throw validationError('Venue is required');
      }
      return managerForceCloseShift(request.params.id, request.body ?? {}, venueId);
    },
  );
}
