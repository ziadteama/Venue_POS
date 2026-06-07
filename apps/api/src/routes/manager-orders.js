import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import {
  searchOrders,
  getOrderExplorerDetail,
  getChequeExplorerDetail,
  getManagerOrderReceipt,
  getManagerChequeReceipt,
  ordersExplorerToCsv,
} from '../services/order-explorer-service.js';

const managerPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER);

function resolveVenueFilter(request) {
  const queryVenue = request.query?.venueId;
  if (queryVenue && request.user.role === ROLES.HUB_MANAGER) return queryVenue;
  if (request.user.role === ROLES.VENUE_MANAGER) return request.user.venue_id;
  return queryVenue;
}

function parseListQuery(request) {
  const q = request.query ?? {};
  return {
    venueId: resolveVenueFilter(request) || undefined,
    q: q.q,
    orderNumber: q.orderNumber,
    chequeNumber: q.chequeNumber,
    tableLabel: q.tableLabel,
    cashier: q.cashier,
    status: q.status,
    paymentMethod: q.paymentMethod,
    from: q.from,
    to: q.to,
    minAmount: q.minAmount,
    maxAmount: q.maxAmount,
    page: q.page,
    limit: q.limit,
    groupBy: q.groupBy,
  };
}

export async function managerOrderRoutes(app) {
  app.get(
    '/api/v1/manager/orders/by-cheque/:chequeId',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request) || undefined;
      return getChequeExplorerDetail(request.params.chequeId, venueId);
    },
  );

  app.get(
    '/api/v1/manager/orders',
    { preHandler: managerPreHandler },
    async (request, reply) => {
      const filters = parseListQuery(request);
      const result = await searchOrders(filters);

      if (request.query?.format === 'csv') {
        const csv = ordersExplorerToCsv(
          await searchOrders({ ...filters, groupBy: undefined }),
        );
        reply.header('content-type', 'text/csv; charset=utf-8');
        reply.header(
          'content-disposition',
          `attachment; filename="orders-${Date.now()}.csv"`,
        );
        return reply.send(csv);
      }

      return result;
    },
  );

  app.get(
    '/api/v1/manager/orders/:id',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request) || undefined;
      return getOrderExplorerDetail(request.params.id, venueId);
    },
  );

  app.get(
    '/api/v1/manager/orders/:id/receipt',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request) || undefined;
      return getManagerOrderReceipt(request.params.id, venueId);
    },
  );

  app.get(
    '/api/v1/manager/cheques/:id/receipt',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      if (!venueId) throw validationError('Venue is required');
      return getManagerChequeReceipt(request.params.id, venueId);
    },
  );
}
