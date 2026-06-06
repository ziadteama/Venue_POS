import Fastify from 'fastify';
import cors from '@fastify/cors';
import { apiFetch } from './services/api-fetch.js';
import { getCachedMenu, syncMenuFromServer } from './services/menu-sync.js';
import { enqueueSync, processSyncQueue } from './services/sync-processor.js';
import {
  createLocalOrder,
  addLocalOrderItem,
  updateLocalOrderItemQty,
  updateLocalOrderTableLabel,
  getLocalOrder,
  pushOrderToServer,
  sendLocalOrder,
  abandonLocalDraft,
  syncOrderAction,
} from './services/orders.js';
import {
  getPrinterHealth,
  printKitchenTicket,
  printCustomerReceipt,
} from './services/kitchen-printer.js';

export async function buildAgentServer({ db, config }) {
  const app = Fastify({ logger: { level: 'info' } });
  const {
    port,
    host,
    apiUrl,
    venueId,
    terminalId,
    terminalSecret,
    corsOrigins,
    kitchenPrinterHost,
    kitchenPrinterPort,
  } = config;

  await app.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type'],
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'local-agent',
    syncQueueDepth: db.prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`).get()
      .n,
    menuCached: Boolean(getCachedMenu(db, venueId)),
    printer: getPrinterHealth(),
    timestamp: new Date().toISOString(),
  }));

  app.get('/v1/status', async () => ({
    online: true,
    sqlite: 'connected',
    venueId,
    version: '0.1.0',
  }));

  app.get('/v1/menu', async () => {
    const menu = getCachedMenu(db, venueId);
    if (!menu) return { venueId, categories: [], versionHash: null };
    return menu;
  });

  app.post('/v1/menu/sync', async () => {
    return syncMenuFromServer({ db, apiUrl, venueId, terminalId, terminalSecret });
  });

  app.post('/v1/sync/replay', async () => {
    return processSyncQueue({ db, apiUrl, terminalId, terminalSecret });
  });

  app.post('/v1/orders', async (request, reply) => {
    const { cashierId, tableLabel } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });

    const order = createLocalOrder(db, { venueId, cashierId, terminalId, tableLabel });
    try {
      const serverOrder = await pushOrderToServer({
        db,
        apiUrl,
        terminalId,
        terminalSecret,
        orderId: order.id,
        cashierId,
      });
      return { ...getLocalOrder(db, order.id), serverOrderNumber: serverOrder.orderNumber };
    } catch (err) {
      enqueueSync(db, 'order.create', {
        orderId: order.id,
        venueId,
        cashierId,
        terminalId,
        tableLabel,
      });
      app.log.warn({ err }, 'Order created locally; server sync deferred');
      return order;
    }
  });

  app.patch('/v1/orders/:id', async (request, reply) => {
    const { tableLabel } = request.body ?? {};
    try {
      if (!getLocalOrder(db, request.params.id)) {
        return apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${request.params.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ tableLabel }),
        });
      }

      const order = updateLocalOrderTableLabel(db, request.params.id, tableLabel);
      try {
        await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${request.params.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ tableLabel }),
        });
      } catch (err) {
        app.log.warn({ err }, 'Table label server sync deferred');
      }
      return order;
    } catch (err) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/v1/orders/:id/items', async (request, reply) => {
    const { menuItemId, quantity = 1, nameEn, nameAr, unitPrice, modifiers = [] } =
      request.body ?? {};
    if (!menuItemId || unitPrice == null || !nameEn || !nameAr) {
      return reply.status(400).send({ error: 'menuItemId, nameEn, nameAr, unitPrice required' });
    }

    try {
      if (!getLocalOrder(db, request.params.id)) {
        return apiFetch(
          apiUrl,
          terminalId,
          terminalSecret,
          `/api/v1/orders/${request.params.id}/items`,
          {
            method: 'POST',
            body: JSON.stringify({ menuItemId, quantity, modifiers }),
          },
        );
      }

      const order = addLocalOrderItem(db, request.params.id, {
        menuItemId,
        quantity,
        nameEn,
        nameAr,
        unitPrice,
        modifiers,
      });

      try {
        await apiFetch(
          apiUrl,
          terminalId,
          terminalSecret,
          `/api/v1/orders/${request.params.id}/items`,
          {
            method: 'POST',
            body: JSON.stringify({ menuItemId, quantity, modifiers }),
          },
        );
      } catch (err) {
        enqueueSync(db, 'order.add_item', {
          orderId: request.params.id,
          menuItemId,
          quantity,
          modifiers,
        });
        app.log.warn({ err }, 'Item stored locally; server sync deferred');
      }

      return order;
    } catch (err) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch('/v1/orders/:id/items/:itemId', async (request, reply) => {
    const { quantity } = request.body ?? {};
    try {
      if (!getLocalOrder(db, request.params.id)) {
        return apiFetch(
          apiUrl,
          terminalId,
          terminalSecret,
          `/api/v1/orders/${request.params.id}/items/${request.params.itemId}`,
          { method: 'PATCH', body: JSON.stringify({ quantity }) },
        );
      }

      const order = updateLocalOrderItemQty(
        db,
        request.params.id,
        request.params.itemId,
        quantity,
      );
      try {
        await syncOrderAction({
          db,
          apiUrl,
          terminalId,
          terminalSecret,
          orderId: request.params.id,
          action: 'patch-item',
          body: { itemId: request.params.itemId, quantity },
        });
      } catch (err) {
        enqueueSync(db, 'order.patch_item', {
          orderId: request.params.id,
          itemId: request.params.itemId,
          quantity,
        });
        app.log.warn({ err }, 'Qty update deferred to sync queue');
      }
      return order;
    } catch (err) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/v1/orders/:id/items/:itemId', async (request, reply) => {
    try {
      if (!getLocalOrder(db, request.params.id)) {
        return apiFetch(
          apiUrl,
          terminalId,
          terminalSecret,
          `/api/v1/orders/${request.params.id}/items/${request.params.itemId}`,
          { method: 'DELETE' },
        );
      }
      return updateLocalOrderItemQty(db, request.params.id, request.params.itemId, 0);
    } catch (err) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/v1/orders/:id/send', async (request) => {
    const local = sendLocalOrder(db, request.params.id);
    const orderForPrint = getLocalOrder(db, request.params.id);
    try {
      const server = await syncOrderAction({
        db,
        apiUrl,
        terminalId,
        terminalSecret,
        orderId: request.params.id,
        action: 'send',
      });
      const merged = { ...getLocalOrder(db, request.params.id), server };
      printKitchenTicket(orderForPrint, {
        host: kitchenPrinterHost,
        port: kitchenPrinterPort,
        log: app.log,
      }).catch((err) => app.log.warn({ err }, 'Kitchen print failed'));
      return merged;
    } catch (err) {
      enqueueSync(db, 'order.send', { orderId: request.params.id });
      app.log.warn({ err }, 'Send queued for sync replay');
      printKitchenTicket(orderForPrint, {
        host: kitchenPrinterHost,
        port: kitchenPrinterPort,
        log: app.log,
      }).catch((printErr) => app.log.warn({ err: printErr }, 'Kitchen print failed'));
      return local;
    }
  });

  app.post('/v1/orders/:id/abandon', async (request, reply) => {
    try {
      const result = abandonLocalDraft(db, request.params.id);
      try {
        await syncOrderAction({
          db,
          apiUrl,
          terminalId,
          terminalSecret,
          orderId: request.params.id,
          action: 'abandon',
        });
      } catch (err) {
        app.log.warn({ err }, 'Draft abandon server sync deferred');
      }
      return result;
    } catch (err) {
      app.log.warn({ err }, 'Abandon draft failed');
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/v1/orders/:id/receipt', async (request, reply) => {
    try {
      const receipt = await syncOrderAction({
        db,
        apiUrl,
        terminalId,
        terminalSecret,
        orderId: request.params.id,
        action: 'receipt',
      });
      return receipt;
    } catch {
      const order = getLocalOrder(db, request.params.id);
      if (!order) return reply.status(404).send({ error: 'Order not found' });
      const lines = [
        `Order ${order.orderNumber ?? order.id}`,
        ...order.items.map(
          (i) => `${i.quantity}x ${i.nameEn} — ${(i.unitPrice * i.quantity).toFixed(2)}`,
        ),
        `Subtotal: ${order.subtotal.toFixed(2)}`,
      ];
      return { text: lines.join('\n') };
    }
  });

  app.get('/v1/orders/:id', async (request, reply) => {
    const order = getLocalOrder(db, request.params.id);
    if (!order) return reply.status(404).send({ error: 'Order not found' });
    return order;
  });

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

  app.post('/v1/cheques/:id/pay', async (request, reply) => {
    const { cashierId, payments, method, amount, tendered } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const result = await apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/cheques/${request.params.id}/pay`,
      {
        method: 'POST',
        body: JSON.stringify({ cashierId, payments, method, amount, tendered }),
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

  await app.listen({ port, host });
  return app;
}
