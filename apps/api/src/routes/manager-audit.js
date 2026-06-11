import { ROLES } from '@venue-pos/shared';
import { requireRoles, requestCanSeeFinancials } from '../middleware/auth.js';
import { forbidden } from '../utils/errors.js';
import { getAuditEventDetail, listFullAuditLog, auditLogToCsv } from '../services/audit-log-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

function resolveVenueId(request) {
  const queryVenue = request.query?.venueId;
  if (queryVenue === 'all') return null;
  return queryVenue ?? request.user.venue_id ?? undefined;
}

export async function managerAuditRoutes(app) {
  app.get(
    '/api/v1/manager/audit',
    { preHandler: hubManagerPreHandler },
    async (request, reply) => {
      const result = await listFullAuditLog(resolveVenueId(request), {
        type: request.query?.type,
        user: request.query?.user,
        from: request.query?.from,
        to: request.query?.to,
        q: request.query?.q,
        page: request.query?.page,
        limit: request.query?.limit,
      });

      if (request.query?.format === 'csv') {
        if (!(await requestCanSeeFinancials(request))) {
          throw forbidden('Financial export is restricted to the owner account');
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="audit-log.csv"');
        return auditLogToCsv(result);
      }
      return result;
    },
  );

  app.get(
    '/api/v1/manager/audit/event',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      return getAuditEventDetail(request.query?.eventId, resolveVenueId(request));
    },
  );
}
