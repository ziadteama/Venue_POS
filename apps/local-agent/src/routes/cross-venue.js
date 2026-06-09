import { apiFetch, sendApiError } from '../services/api-fetch.js';
import { printCustomerReceipt } from '../services/kitchen-printer.js';

/**
 * Cross-venue ordering is online-only: an anchor terminal builds one order
 * spanning linked venues, fires each venue's kitchen, and pays once. These
 * routes proxy to the central API (no local SQLite cache).
 */
export function registerCrossVenueRoutes(
  app,
  { apiUrl, terminalId, terminalSecret, getPrinterConfig, autoReceiptPrint },
) {
  app.get('/v1/cross-venue/cheques/:chequeId/group', async (request, reply) => {
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/cheques/${request.params.chequeId}/group`,
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/cheques/:chequeId/items', async (request, reply) => {
    const { cashierId, venueId, menuItemId } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    if (!venueId) return reply.status(400).send({ error: 'venueId required' });
    if (!menuItemId) return reply.status(400).send({ error: 'menuItemId required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/cheques/${request.params.chequeId}/items`,
        { method: 'POST', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.patch('/v1/cross-venue/cheques/:chequeId/items/:itemId', async (request, reply) => {
    const venueId = request.query?.venueId;
    if (!venueId) return reply.status(400).send({ error: 'venueId query required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/cheques/${request.params.chequeId}/items/${request.params.itemId}?venueId=${venueId}`,
        { method: 'PATCH', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.delete('/v1/cross-venue/cheques/:chequeId/items/:itemId', async (request, reply) => {
    const venueId = request.query?.venueId;
    if (!venueId) return reply.status(400).send({ error: 'venueId query required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/cheques/${request.params.chequeId}/items/${request.params.itemId}?venueId=${venueId}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.get('/v1/cross-venue/menu/:venueId', async (request, reply) => {
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/menu/${request.params.venueId}`,
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/order', async (request, reply) => {
    const { cashierId } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cross-venue/order', {
        method: 'POST',
        body: JSON.stringify(request.body),
      });
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.get('/v1/cross-venue/order/:groupId', async (request, reply) => {
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}`,
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/order/:groupId/items', async (request, reply) => {
    const { cashierId, venueId, menuItemId } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    if (!venueId) return reply.status(400).send({ error: 'venueId required' });
    if (!menuItemId) return reply.status(400).send({ error: 'menuItemId required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/items`,
        { method: 'POST', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.patch('/v1/cross-venue/order/:groupId/items/:itemId', async (request, reply) => {
    const venueId = request.query?.venueId;
    if (!venueId) return reply.status(400).send({ error: 'venueId query required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/items/${request.params.itemId}?venueId=${venueId}`,
        { method: 'PATCH', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.delete('/v1/cross-venue/order/:groupId/items/:itemId', async (request, reply) => {
    const venueId = request.query?.venueId;
    if (!venueId) return reply.status(400).send({ error: 'venueId query required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/items/${request.params.itemId}?venueId=${venueId}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/order/:groupId/fire', async (request, reply) => {
    const { cashierId } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/fire`,
        { method: 'POST', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/order/:groupId/cancel', async (request, reply) => {
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/cancel`,
        { method: 'POST', body: JSON.stringify(request.body ?? {}) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/order/:groupId/pay', async (request, reply) => {
    const { cashierId } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      const result = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/pay`,
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
