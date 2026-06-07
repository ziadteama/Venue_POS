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

/** Hub owner — venue floor staff use POS order lookup (terminal API). */
const hubOwnerPreHandler = requireRoles(ROLES.HUB_OWNER);

function resolveVenueFilter(request) {
  return request.query?.venueId || undefined;
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
    { preHandler: hubOwnerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request) || undefined;
      return getChequeExplorerDetail(request.params.chequeId, venueId);
    },
  );

  app.get(
    '/api/v1/manager/orders',
    { preHandler: hubOwnerPreHandler },
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
    { preHandler: hubOwnerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request) || undefined;
      return getOrderExplorerDetail(request.params.id, venueId);
    },
  );

  app.get(
    '/api/v1/manager/orders/:id/receipt',
    { preHandler: hubOwnerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request) || undefined;
      return getManagerOrderReceipt(request.params.id, venueId);
    },
  );

  app.get(
    '/api/v1/manager/cheques/:id/receipt',
    { preHandler: hubOwnerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      if (!venueId) throw validationError('Venue is required');
      return getManagerChequeReceipt(request.params.id, venueId);
    },
  );
}
