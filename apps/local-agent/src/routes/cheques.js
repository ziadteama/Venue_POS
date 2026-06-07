import { apiFetch } from '../services/api-fetch.js';
import { printKitchenTicket, printCustomerReceipt } from '../services/kitchen-printer.js';

function maybePrintReceipt(text, { autoReceiptPrint, receiptPrinterHost, receiptPrinterPort, log }) {
  if (!autoReceiptPrint || !text) return;
  printCustomerReceipt(text, {
    host: receiptPrinterHost,
    port: receiptPrinterPort,
    log,
  }).catch((err) => log.warn({ err }, 'Receipt print failed'));
}

export function registerChequeRoutes(
  app,
  { apiUrl, terminalId, terminalSecret, getPrinterConfig, autoReceiptPrint },
) {
  app.get('/v1/cheques/open', async () =>
    apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open'),
  );

  app.get('/v1/cheques/paid', async (request) => {
    const limit = request.query?.limit ?? 30;
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/paid?limit=${limit}`,
    );
  });

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

  app.delete('/v1/cheques/:id', async (request) =>
    apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/cheques/${request.params.id}`, {
      method: 'DELETE',
    }),
  );

  app.post('/v1/cheques/:id/fire', async (request) => {
    const result = await apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/fire`,
      { method: 'POST' },
    );
    const printers = getPrinterConfig();
    printKitchenTicket(result.sentOrder, {
      host: printers.kitchenPrinterHost,
      port: printers.kitchenPrinterPort,
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

  app.post('/v1/cheques/:id/split-amount', async (request, reply) => {
    const { splits } = request.body ?? {};
    if (!splits?.length) return reply.status(400).send({ error: 'splits required' });
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/split-amount`,
      { method: 'POST', body: JSON.stringify({ splits }) },
    );
  });

  app.post('/v1/cheques/:id/transfer', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.cashierId) return reply.status(400).send({ error: 'cashierId required' });
    if (!body.itemIds?.length) return reply.status(400).send({ error: 'itemIds required' });
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/transfer`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  });

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
    const printers = getPrinterConfig();
    maybePrintReceipt(result.receipt, {
      autoReceiptPrint,
      receiptPrinterHost: printers.receiptPrinterHost,
      receiptPrinterPort: printers.receiptPrinterPort,
      log: app.log,
    });
    return result;
  });

  app.post('/v1/cheques/:id/discount', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.cashierId) return reply.status(400).send({ error: 'cashierId required' });
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/discount`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  });

  app.post('/v1/cheques/:id/refund', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const result = await apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/refund`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (result.receipt) {
      const printers = getPrinterConfig();
      maybePrintReceipt(result.receipt, {
        autoReceiptPrint,
        receiptPrinterHost: printers.receiptPrinterHost,
        receiptPrinterPort: printers.receiptPrinterPort,
        log: app.log,
      });
    }
    return result;
  });
}
