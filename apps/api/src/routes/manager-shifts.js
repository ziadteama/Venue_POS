import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import {
  listManagerShifts,
  getManagerShiftDetail,
  managerForceCloseShift,
  shiftsListToCsv,
  getEodReconciliation,
  eodReconciliationToCsv,
} from '../services/manager-shift-service.js';

const hubOwnerPreHandler = requireRoles(ROLES.HUB_OWNER);

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
}

export async function managerShiftsRoutes(app) {
  app.get(
    '/api/v1/manager/shifts',
    { preHandler: hubOwnerPreHandler },
    async (request, reply) => {
      const venueId = resolveVenueFilter(request);
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
    '/api/v1/manager/shifts/eod',
    { preHandler: hubOwnerPreHandler },
    async (request, reply) => {
      const venueId = resolveVenueFilter(request);
      const result = await getEodReconciliation({
        venueId,
        date: request.query?.date,
      });

      if (request.query?.format === 'csv') {
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="eod-reconciliation.csv"');
        return eodReconciliationToCsv(result);
      }
      return result;
    },
  );

  app.get(
    '/api/v1/manager/shifts/:id',
    { preHandler: hubOwnerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      return getManagerShiftDetail(request.params.id, venueId);
    },
  );

  app.post(
    '/api/v1/manager/shifts/:id/force-close',
    { preHandler: hubOwnerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      return managerForceCloseShift(request.params.id, request.body ?? {}, venueId);
    },
  );
}
