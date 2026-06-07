import { apiFetch, sendApiError } from '../services/api-fetch.js';
import { printCustomerReceipt } from '../services/kitchen-printer.js';

/**
 * Cross-venue billing is online-only: an anchor terminal settles other venues'
 * open cheques in one tender. These routes proxy to the central API (no local
 * SQLite cache) and surface a clear error when the hub is unreachable.
 */
export function registerCrossVenueRoutes(
  app,
  { apiUrl, terminalId, terminalSecret, getPrinterConfig, autoReceiptPrint },
) {
  app.get('/v1/cross-venue/billable', async (request, reply) => {
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cross-venue/billable');
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/groups', async (request, reply) => {
    const { cashierId, chequeIds } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    if (!chequeIds?.length) return reply.status(400).send({ error: 'chequeIds required' });
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cross-venue/groups', {
        method: 'POST',
        body: JSON.stringify({ cashierId, chequeIds }),
      });
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.get('/v1/cross-venue/groups/:groupId', async (request, reply) => {
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/groups/${request.params.groupId}`,
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/groups/:groupId/cancel', async (request, reply) => {
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/groups/${request.params.groupId}/cancel`,
        { method: 'POST', body: JSON.stringify(request.body ?? {}) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/groups/:groupId/pay', async (request, reply) => {
    const { cashierId } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      const result = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/groups/${request.params.groupId}/pay`,
        { method: 'POST', body: JSON.stringify(request.body) },
      );
      if (result.receipt && autoReceiptPrint) {
        const printers = getPrinterConfig();
        printCustomerReceipt(result.receipt, {
          host: printers.receiptPrinterHost,
          port: printers.receiptPrinterPort,
          log: app.log,
        }).catch((err) => app.log.warn({ err }, 'Cross-venue receipt print failed'));
      }
      return result;
    } catch (err) {
      return sendApiError(reply, err);
    }
  });
}
