import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { forbidden } from '../utils/errors.js';
import {
  listManagerShifts,
  getManagerShiftDetail,
  managerForceCloseShift,
  shiftsListToCsv,
  getEodReconciliation,
  eodReconciliationToCsv,
} from '../services/manager-shift-service.js';
import { requestCanSeeFinancials } from '../middleware/auth.js';
import {
  redactEodFinancials,
  redactShiftListFinancials,
  redactShiftRowFinancials,
} from '../services/financial-redact.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
}

export async function managerShiftsRoutes(app) {
  app.get(
    '/api/v1/manager/shifts',
    { preHandler: hubManagerPreHandler },
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
        if (!(await requestCanSeeFinancials(request))) {
          throw forbidden('Financial export is restricted to the owner account');
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header(
          'Content-Disposition',
          'attachment; filename="shifts-export.csv"',
        );
        return shiftsListToCsv(result);
      }

      return (await requestCanSeeFinancials(request)) ? result : redactShiftListFinancials(result);
    },
  );

  app.get(
    '/api/v1/manager/shifts/eod',
    { preHandler: hubManagerPreHandler },
    async (request, reply) => {
      const venueId = resolveVenueFilter(request);
      const result = await getEodReconciliation({
        venueId,
        date: request.query?.date,
      });

      if (request.query?.format === 'csv') {
        if (!(await requestCanSeeFinancials(request))) {
          throw forbidden('Financial export is restricted to the owner account');
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="eod-reconciliation.csv"');
        return eodReconciliationToCsv(result);
      }
      return (await requestCanSeeFinancials(request)) ? result : redactEodFinancials(result);
    },
  );

  app.get(
    '/api/v1/manager/shifts/:id',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      const detail = await getManagerShiftDetail(request.params.id, venueId);
      return (await requestCanSeeFinancials(request)) ? detail : redactShiftRowFinancials(detail);
    },
  );

  app.post(
    '/api/v1/manager/shifts/:id/force-close',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      return managerForceCloseShift(request.params.id, request.body ?? {}, venueId);
    },
  );
}
