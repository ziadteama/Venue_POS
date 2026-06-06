import { apiFetch } from '../services/api-fetch.js';
import { printKitchenTicket, printCustomerReceipt } from '../services/kitchen-printer.js';

export function registerChequeRoutes(
  app,
  { apiUrl, terminalId, terminalSecret, kitchenPrinterHost, kitchenPrinterPort },
) {
  app.get('/v1/cheques/open', async () =>
    apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open'),
  );

  app.post('/v1/cheques/open', async (request, reply) => {
    const { cashierId, tableLabel } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open', {
      method: 'POST',
      body: JSON.stringify({ cashierId, tableLabel }),
    });
  });

  app.get('/v1/cheques/:id', async (request) =>
    apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/cheques/${request.params.id}`),
  );

  app.post('/v1/cheques/:id/fire', async (request) => {
    const result = await apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/fire`,
      { method: 'POST' },
    );
    printKitchenTicket(result.sentOrder, {
      host: kitchenPrinterHost,
      port: kitchenPrinterPort,
      log: app.log,
    }).catch((err) => app.log.warn({ err }, 'Kitchen print failed'));
    return result;
  });

  app.post('/v1/cheques/:id/clear', async (request) =>
    apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/cheques/${request.params.id}/clear`, {
      method: 'POST',
    }),
  );

  app.get('/v1/cheques/:id/receipt', async (request) =>
    apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/receipt`,
    ),
  );

  app.post('/v1/cheques/:id/split', async (request, reply) => {
    const { splits } = request.body ?? {};
    if (!splits?.length) return reply.status(400).send({ error: 'splits required' });
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/split`,
      { method: 'POST', body: JSON.stringify({ splits }) },
    );
  });

  app.post('/v1/cheques/:id/pay', async (request, reply) => {
    const { cashierId, payments, method, amount, tendered, managerPin } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const result = await apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/pay`,
      {
        method: 'POST',
        body: JSON.stringify({ cashierId, payments, method, amount, tendered, managerPin }),
      },
    );
    if (result.receipt) {
      printCustomerReceipt(result.receipt, {
        host: kitchenPrinterHost,
        port: kitchenPrinterPort,
        log: app.log,
      }).catch((err) => app.log.warn({ err }, 'Receipt print failed'));
    }
    return result;
  });
}
