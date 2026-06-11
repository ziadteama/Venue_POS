import { randomUUID } from 'node:crypto';
import { SYNC_EVENT_TYPES, CHEQUE_HYDRATE_MIN_INTERVAL_MS } from '@venue-pos/shared';
import { apiFetch, sendApiError } from '../services/api-fetch.js';
import { enqueueSync } from '../services/sync-processor.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  openLocalCheque,
  listLocalOpenCheques,
  listLocalPaidCheques,
  getLocalChequeById,
  fireLocalCheque,
  payLocalCheque,
  applyLocalChequeDiscount,
  removeLocalChequeDiscount,
  clearLocalChequeDraft,
  closeEmptyLocalCheque,
  moveLocalChequeTable,
  transferLocalChequeItems,
  splitLocalChequeByItems,
  buildLocalReceiptText,
  recordLocalCheckPrint,
  adjustLocalPrePaymentItemQty,
} from '../services/local-cheques.js';
import { hydrateOpenCheques } from '../services/cheque-hydration.js';
import { assertMenuReadyForWrite } from '../services/menu-gate.js';
import { occupyFloorUpstream, releaseFloorUpstream } from '../services/floor-upstream.js';
import { verifyCachedManagerPin } from '../services/terminal-cache.js';
import { printKitchenTicket } from '../services/kitchen-printer.js';
import { printReceiptText } from '../services/receipt-printer.js';
import { openDrawerIfCashPayment } from '../services/cash-drawer.js';
import { maybePrintReceipt, printPayReceipts } from '../services/receipt-print.js';

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

  let lastChequeHydrateAt = 0;

  app.get('/v1/cheques/open', async () => {
    try {
      const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open');
      if (isCloudOnline()) {
        const now = Date.now();
        if (now - lastChequeHydrateAt >= CHEQUE_HYDRATE_MIN_INTERVAL_MS) {
          lastChequeHydrateAt = now;
          try {
            await hydrateOpenCheques({ db, apiUrl, venueId, terminalId, terminalSecret });
          } catch (hydrateErr) {
            app.log.warn({ hydrateErr }, 'Cheque hydration on list failed');
          }
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
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/paid?limit=${limit}`,
      );
    } catch (err) {
      if (isCloudOnline()) throw err;
      return listLocalPaidCheques(db, venueId, Number(limit) || 30);
    }
  });

  app.post('/v1/cheques/open', async (request, reply) => {
    const { cashierId, tableLabel, serviceMode = 'dine_in' } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    if (serviceMode === 'dine_in' && !tableLabel?.trim()) {
      return reply.status(400).send({ error: 'tableLabel required for dine-in' });
    }

    try {
      assertMenuReadyForWrite(db, venueId);
    } catch (gateErr) {
      return reply.status(gateErr.statusCode ?? 409).send({ error: gateErr.message });
    }

    const syncId = randomUUID();
    const openBody = { cashierId, serviceMode, syncId };
    if (tableLabel?.trim()) openBody.tableLabel = tableLabel.trim();

    try {
      const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open', {
        method: 'POST',
        body: JSON.stringify(openBody),
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
        serviceMode,
      });
      if (serviceMode !== 'takeaway') {
        try {
          await occupyFloorUpstream(routeCtx, {
            tableLabel: cheque.tableLabel,
            chequeId: cheque.id,
            venueId,
          });
        } catch (floorErr) {
          app.log.warn({ floorErr }, 'Floor occupy failed offline');
        }
      }
      enqueueSync(
        db,
        SYNC_EVENT_TYPES.CHEQUE_OPEN,
        { chequeId: cheque.id, cashierId, tableLabel: cheque.tableLabel, serviceMode },
        syncId,
      );
      app.log.warn({ err }, 'Cheque opened locally; server sync deferred');
      return cheque;
    }
  });

  app.get('/v1/cheques/:id', async (request, reply) => {
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/cheques/${request.params.id}`);
    } catch (err) {
      const local = getLocalChequeById(db, request.params.id);
      if (local) return local;
      return sendApiError(reply, err);
    }
  });

  app.delete('/v1/cheques/:id', async (request, reply) => {
    const syncId = randomUUID();
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/cheques/${request.params.id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      try {
        const result = closeEmptyLocalCheque(db, request.params.id, venueId);
        if (result.serviceMode !== 'takeaway') {
          await releaseFloorUpstream(routeCtx, {
            tableLabel: result.tableLabel,
            chequeId: request.params.id,
          }).catch(() => {});
        }
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CHEQUE_VOID,
          { chequeId: request.params.id },
          syncId,
        );
        return result;
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
  });

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

  app.post('/v1/cheques/:id/clear', async (request, reply) => {
    const syncId = randomUUID();
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/clear`,
        { method: 'POST' },
      );
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      try {
        const result = clearLocalChequeDraft(db, request.params.id);
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CHEQUE_CLEAR,
          { chequeId: request.params.id },
          syncId,
        );
        return result;
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
  });

  app.get('/v1/cheques/:id/receipt', async (request) => {
    try {
      const preview = request.query?.preview === 'true' || request.query?.preview === '1';
      const qs = preview ? '?preview=true' : '';
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/receipt${qs}`,
      );
    } catch {
      const cheque = getLocalChequeById(db, request.params.id);
      if (!cheque) throw new Error('Cheque not found');
      return { text: `OFFLINE\nTable ${cheque.tableLabel}\nTotal ${cheque.total}` };
    }
  });

  app.get('/v1/cheques/:id/receipt-bundle', async (request) =>
    apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/receipt-bundle`,
    ),
  );

  app.post('/v1/cheques/:id/print-receipt', async (request, reply) => {
    const { mode = 'single', chequeId, cashierId } = request.body ?? {};
    const parentId = request.params.id;
    const printers = getPrinterConfig();

    try {
      if (mode === 'full' || mode === 'separate') {
        const bundle = await apiFetch(
          apiUrl,
          terminalId,
          terminalSecret,
          `/api/v1/cheques/${parentId}/receipt-bundle`,
        );
        const texts =
          mode === 'full'
            ? [bundle.full]
            : (bundle.separate ?? []).map((row) => row.text);
        for (const text of texts) {
          if (!text) continue;
          await printReceiptText(text, {
            host: printers.receiptPrinterHost,
            port: printers.receiptPrinterPort,
            log: app.log,
          });
        }
        return { printed: texts.length, mode };
      }

      const targetId = chequeId ?? parentId;
      const syncId = randomUUID();
      const result = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${targetId}/check-print`,
        {
          method: 'POST',
          body: JSON.stringify({ cashierId, syncId }),
        },
      );
      await printReceiptText(result.text, {
        host: printers.receiptPrinterHost,
        port: printers.receiptPrinterPort,
        log: app.log,
      });
      return { printed: 1, mode: 'single', printCount: result.printCount, cheque: result.cheque };
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      const targetId = chequeId ?? parentId;
      if (!getLocalChequeById(db, targetId)) {
        return reply.status(404).send({ error: 'Cheque not found' });
      }
      const syncId = randomUUID();
      const cheque = recordLocalCheckPrint(db, targetId);
      enqueueSync(
        db,
        SYNC_EVENT_TYPES.CHEQUE_CHECK_PRINT,
        { chequeId: targetId, cashierId, syncId },
        syncId,
      );
      const text = buildLocalReceiptText(db, targetId, { preview: true });
      await printReceiptText(text, {
        host: printers.receiptPrinterHost,
        port: printers.receiptPrinterPort,
        log: app.log,
      });
      return { printed: 1, mode: 'single', offline: true, printCount: cheque.prePaymentCheckPrintCount, cheque };
    }
  });

  app.patch('/v1/cheques/:chequeId/orders/:orderId/items/:itemId', async (request, reply) => {
    const { quantity, cashierId } = request.body ?? {};
    const syncId = randomUUID();
    try {
      const result = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.chequeId}/orders/${request.params.orderId}/items/${request.params.itemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ quantity, cashierId, syncId }),
        },
      );
      return result;
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      try {
        const cheque = adjustLocalPrePaymentItemQty(
          db,
          request.params.chequeId,
          request.params.orderId,
          request.params.itemId,
          quantity,
        );
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CHEQUE_PRE_PAY_ADJUST,
          {
            chequeId: request.params.chequeId,
            orderId: request.params.orderId,
            itemId: request.params.itemId,
            quantity,
            cashierId,
            syncId,
          },
          syncId,
        );
        return cheque;
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
  });

  app.patch('/v1/cheques/:id/table', async (request, reply) => {
    const { targetTableLabel } = request.body ?? {};
    const syncId = randomUUID();
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/table`,
        { method: 'PATCH', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      try {
        const moved = moveLocalChequeTable(db, request.params.id, targetTableLabel, venueId);
        await releaseFloorUpstream(routeCtx, {
          tableLabel: moved.oldTableLabel,
          chequeId: request.params.id,
        }).catch(() => {});
        await occupyFloorUpstream(routeCtx, {
          tableLabel: targetTableLabel,
          chequeId: request.params.id,
          venueId,
        }).catch(() => {});
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CHEQUE_TABLE_MOVE,
          { chequeId: request.params.id, targetTableLabel },
          syncId,
        );
        return moved.cheque;
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
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
    const syncId = randomUUID();
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/transfer`,
        { method: 'POST', body: JSON.stringify(body) },
      );
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      const manager = await verifyCachedManagerPin(db, body.managerPin);
      if (!manager) return reply.status(401).send({ error: 'Invalid manager PIN' });
      try {
        const result = transferLocalChequeItems(
          db,
          request.params.id,
          body,
          venueId,
          terminalId,
        );
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CHEQUE_TRANSFER,
          { chequeId: request.params.id, body },
          syncId,
        );
        return result;
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
  });

  app.post('/v1/cheques/:id/split', async (request, reply) => {
    const { splits } = request.body ?? {};
    if (!splits?.length) return reply.status(400).send({ error: 'splits required' });
    const syncId = randomUUID();
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/split`,
        { method: 'POST', body: JSON.stringify({ splits }) },
      );
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      try {
        const result = splitLocalChequeByItems(db, request.params.id, { splits }, venueId);
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CHEQUE_SPLIT,
          { chequeId: request.params.id, splits },
          syncId,
        );
        return result;
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
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
      const printerOpts = {
        host: printers.receiptPrinterHost,
        port: printers.receiptPrinterPort,
        log: app.log,
      };
      printPayReceipts(result, printerOpts);
      openDrawerIfCashPayment(payBody, app.log, printerOpts);
      if (
        result.tableSettled &&
        result.cheque?.tableLabel &&
        result.cheque.serviceMode !== 'takeaway'
      ) {
        const rootId = result.cheque.parentChequeId ?? result.cheque.id;
        await releaseFloorUpstream(routeCtx, {
          tableLabel: result.cheque.tableLabel,
          chequeId: rootId,
        }).catch((e) => app.log.warn({ e }, 'Floor release failed after pay'));
      }
      return result;
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      try {
        const result = payLocalCheque(db, request.params.id, { payments, method, amount });
        const cheque = getLocalChequeById(db, request.params.id);
        if (cheque?.tableLabel && result.tableSettled && cheque.serviceMode !== 'takeaway') {
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
        const printerOpts = {
          host: printers.receiptPrinterHost,
          port: printers.receiptPrinterPort,
          log: app.log,
        };
        printPayReceipts(
          {
            ...result,
            restaurantReceipt: result.restaurantReceipt ?? result.receipt,
          },
          printerOpts,
        );
        openDrawerIfCashPayment(payBody, app.log, printerOpts);
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
    const syncId = randomUUID();
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/discount`,
        { method: 'PATCH', body: JSON.stringify({ ...body, syncId }) },
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
        { chequeId: request.params.id, body, action: 'change' },
        syncId,
      );
      return cheque;
    }
  });

  app.post('/v1/cheques/:id/discount/remove', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const syncId = randomUUID();
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cheques/${request.params.id}/discount/remove`,
        { method: 'POST', body: JSON.stringify({ ...body, syncId }) },
      );
    } catch (err) {
      if (isCloudOnline()) return sendApiError(reply, err);
      const manager = await verifyCachedManagerPin(db, body.restaurantManagerPin);
      if (!manager) return reply.status(401).send({ error: 'Invalid manager PIN' });
      const cheque = removeLocalChequeDiscount(db, request.params.id);
      enqueueSync(
        db,
        SYNC_EVENT_TYPES.CHEQUE_DISCOUNT,
        { chequeId: request.params.id, body, action: 'remove' },
        syncId,
      );
      return cheque;
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
      if (isCloudOnline()) return sendApiError(reply, err);
      return reply.status(503).send({
        error: {
          code: 'OFFLINE_MODE',
          message: 'Refunds require hub connection',
        },
      });
    }
  });
}
