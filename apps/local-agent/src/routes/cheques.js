import { randomUUID } from 'node:crypto';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';
import { apiFetch, sendApiError } from '../services/api-fetch.js';
import { enqueueSync } from '../services/sync-processor.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  openLocalCheque,
  listLocalOpenCheques,
  getLocalChequeById,
  fireLocalCheque,
  payLocalCheque,
  applyLocalChequeDiscount,
  removeLocalChequeDiscount,
} from '../services/local-cheques.js';
import { hydrateOpenCheques } from '../services/cheque-hydration.js';
import { assertMenuReadyForWrite } from '../services/menu-gate.js';
import { occupyFloorUpstream, releaseFloorUpstream } from '../services/floor-upstream.js';
import { verifyCachedManagerPin } from '../services/terminal-cache.js';
import { printKitchenTicket, printCustomerReceipt } from '../services/kitchen-printer.js';

function maybePrintReceipt(text, { autoReceiptPrint, receiptPrinterHost, receiptPrinterPort, log }) {
  if (!autoReceiptPrint || !text) return;
  printCustomerReceipt(text, {
    host: receiptPrinterHost,
    port: receiptPrinterPort,
    log,
  }).catch((err) => log.warn({ err }, 'Receipt print failed'));
}

export function registerChequeRoutes(app, routeCtx) {
  const {
    db,
    apiUrl,
    venueId,
    terminalId,
    terminalSecret,
    getPrinterConfig,
    autoReceiptPrint,
  } = routeCtx;
  app.get('/v1/cheques/open', async () => {
    try {
      const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open');
      if (isCloudOnline()) {
        try {
          await hydrateOpenCheques({ db, apiUrl, venueId, terminalId, terminalSecret });
        } catch (hydrateErr) {
          app.log.warn({ hydrateErr }, 'Cheque hydration on list failed');
        }
      }
      return result;
    } catch (err) {
      if (isCloudOnline()) throw err;
      return listLocalOpenCheques(db, venueId);
    }
  });

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

    try {
      assertMenuReadyForWrite(db, venueId);
    } catch (gateErr) {
      return reply.status(gateErr.statusCode ?? 409).send({ error: gateErr.message });
    }

    const syncId = randomUUID();
    try {
      const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open', {
        method: 'POST',
        body: JSON.stringify({ cashierId, tableLabel, syncId }),
      });
      return result;
    } catch (err) {
      if (isCloudOnline()) throw err;
      const cheque = openLocalCheque(db, {
        id: syncId,
        venueId,
        terminalId,
        cashierId,
        tableLabel,
      });
      try {
        await occupyFloorUpstream(routeCtx, {
          tableLabel,
          chequeId: cheque.id,
          venueId,
        });
      } catch (floorErr) {
        app.log.warn({ floorErr }, 'Floor occupy failed offline');
      }
      enqueueSync(
        db,
        SYNC_EVENT_TYPES.CHEQUE_OPEN,
        { chequeId: cheque.id, cashierId, tableLabel },
        syncId,
      );
      app.log.warn({ err }, 'Cheque opened locally; server sync deferred');
      return cheque;
    }
  });

  app.get('/v1/cheques/:id', async (request) => {
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/cheques/${request.params.id}`);
    } catch (err) {
      const local = getLocalChequeById(db, request.params.id);
      if (local) return local;
      throw err;
    }
  });

  app.delete('/v1/cheques/:id', async (request) =>
    apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/cheques/${request.params.id}`, {
      method: 'DELETE',
    }),
  );

  app.post('/v1/cheques/:id/fire', async (request) => {
    const syncId = randomUUID();
    try {
      const result = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/fire`,
        { method: 'POST', body: JSON.stringify({ syncId }) },
      );
      const printers = getPrinterConfig();
      const sent = result.sentOrder ?? result.sentOrders?.[0];
      if (sent) {
        printKitchenTicket(sent, {
          host: printers.kitchenPrinterHost,
          port: printers.kitchenPrinterPort,
          log: app.log,
        }).catch((err) => app.log.warn({ err }, 'Kitchen print failed'));
      }
      return result;
    } catch (err) {
      if (isCloudOnline()) throw err;
      const result = fireLocalCheque(db, request.params.id);
      enqueueSync(
        db,
        SYNC_EVENT_TYPES.CHEQUE_FIRE,
        { chequeId: request.params.id },
        syncId,
      );
      const printers = getPrinterConfig();
      if (result.sentOrder) {
        printKitchenTicket(result.sentOrder, {
          host: printers.kitchenPrinterHost,
          port: printers.kitchenPrinterPort,
          log: app.log,
        }).catch((e) => app.log.warn({ e }, 'Kitchen print failed'));
      }
      app.log.warn({ err }, 'Cheque fire stored locally');
      return result;
    }
  });

  app.post('/v1/cheques/:id/clear', async (request) =>
    apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/cheques/${request.params.id}/clear`, {
      method: 'POST',
    }),
  );

  app.get('/v1/cheques/:id/receipt', async (request) => {
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/receipt`,
      );
    } catch {
      const cheque = getLocalChequeById(db, request.params.id);
      if (!cheque) throw new Error('Cheque not found');
      return { text: `OFFLINE\nTable ${cheque.tableLabel}\nTotal ${cheque.total}` };
    }
  });

  app.post('/v1/cheques/:id/split-amount', async (request, reply) => {
    const { splits, cashierId, payments } = request.body ?? {};
    if (!splits?.length && !payments?.length) {
      return reply.status(400).send({ error: 'splits or payments required' });
    }
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/split-amount`,
        { method: 'POST', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      if (payments?.length && cashierId) {
        const syncId = randomUUID();
        const payBody = { cashierId, payments };
        const result = payLocalCheque(db, request.params.id, { payments });
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CHEQUE_PAY,
          { chequeId: request.params.id, payBody },
          syncId,
        );
        return result;
      }
      return reply.status(503).send({ error: 'Split cheques require hub connection' });
    }
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
    const syncId = randomUUID();
    const payBody = { cashierId, payments, method, amount, tendered, managerPin };
    try {
      const result = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/pay`,
        {
          method: 'POST',
          body: JSON.stringify({ ...payBody, syncId }),
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
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      try {
        const result = payLocalCheque(db, request.params.id, { payments, method, amount });
        const cheque = getLocalChequeById(db, request.params.id);
        if (cheque?.tableLabel) {
          await releaseFloorUpstream(routeCtx, {
            tableLabel: cheque.tableLabel,
            chequeId: request.params.id,
          }).catch((e) => app.log.warn({ e }, 'Floor release failed offline'));
        }
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CHEQUE_PAY,
          { chequeId: request.params.id, payBody },
          syncId,
        );
        const printers = getPrinterConfig();
        maybePrintReceipt(result.receipt, {
          autoReceiptPrint,
          receiptPrinterHost: printers.receiptPrinterHost,
          receiptPrinterPort: printers.receiptPrinterPort,
          log: app.log,
        });
        app.log.warn({ err }, 'Cheque payment stored locally');
        return result;
      } catch (localErr) {
        return sendApiError(reply, localErr.statusCode ? localErr : err);
      }
    }
  });

  app.post('/v1/cheques/:id/discount', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const syncId = randomUUID();
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/discount`,
        { method: 'POST', body: JSON.stringify({ ...body, syncId }) },
      );
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      const manager = await verifyCachedManagerPin(db, body.restaurantManagerPin);
      if (!manager) return reply.status(401).send({ error: 'Invalid manager PIN' });
      const cheque = applyLocalChequeDiscount(db, request.params.id, {
        amount: body.amount,
        percent: body.percent,
      });
      enqueueSync(
        db,
        SYNC_EVENT_TYPES.CHEQUE_DISCOUNT,
        { chequeId: request.params.id, body },
        syncId,
      );
      return cheque;
    }
  });

  app.patch('/v1/cheques/:id/discount', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/discount`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cheques/:id/discount/remove', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/discount/remove`,
        { method: 'POST', body: JSON.stringify(body) },
      );
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cheques/:id/refund', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
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
    } catch (err) {
      return sendApiError(reply, err);
    }
  });
}
