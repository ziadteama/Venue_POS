import { authenticateTerminal } from '../middleware/terminal.js';
import {
  searchOrders,
  getOrderExplorerDetail,
  getChequeExplorerDetail,
  getManagerOrderReceipt,
} from '../services/order-explorer-service.js';

function parseTerminalListQuery(request) {
  const q = request.query ?? {};
  return {
    venueId: request.terminal.venueId,
    q: q.q,
    orderNumber: q.orderNumber,
    chequeNumber: q.chequeNumber,
    tableLabel: q.tableLabel,
    cashier: q.cashier,
    status: q.status,
    from: q.from,
    to: q.to,
    page: q.page,
    limit: q.limit ?? 20,
    groupBy: q.groupBy ?? 'cheque',
  };
}

export async function terminalOrderExplorerRoutes(app) {
  app.get(
    '/api/v1/terminal/order-explorer',
    { preHandler: authenticateTerminal },
    async (request) => searchOrders(parseTerminalListQuery(request)),
  );

  app.get(
    '/api/v1/terminal/order-explorer/by-cheque/:chequeId',
    { preHandler: authenticateTerminal },
    async (request) =>
      getChequeExplorerDetail(request.params.chequeId, request.terminal.venueId),
  );

  app.get(
    '/api/v1/terminal/order-explorer/:orderId',
    { preHandler: authenticateTerminal },
    async (request) =>
      getOrderExplorerDetail(request.params.orderId, request.terminal.venueId),
  );

  app.get(
    '/api/v1/terminal/order-explorer/:orderId/receipt',
    { preHandler: authenticateTerminal },
    async (request) =>
      getManagerOrderReceipt(request.params.orderId, request.terminal.venueId),
  );
}
