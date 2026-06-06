import { apiFetch } from '../services/api-fetch.js';
import { enqueueSync } from '../services/sync-processor.js';
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
} from '../services/orders.js';
import { printKitchenTicket } from '../services/kitchen-printer.js';

export function registerOrderRoutes(
  app,
  { db, apiUrl, venueId, terminalId, terminalSecret, kitchenPrinterHost, kitchenPrinterPort },
) {
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
    const printOpts = {
      host: kitchenPrinterHost,
      port: kitchenPrinterPort,
      log: app.log,
    };
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
      printKitchenTicket(orderForPrint, printOpts).catch((err) =>
        app.log.warn({ err }, 'Kitchen print failed'),
      );
      return merged;
    } catch (err) {
      enqueueSync(db, 'order.send', { orderId: request.params.id });
      app.log.warn({ err }, 'Send queued for sync replay');
      printKitchenTicket(orderForPrint, printOpts).catch((printErr) =>
        app.log.warn({ err: printErr }, 'Kitchen print failed'),
      );
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
      return await syncOrderAction({
        db,
        apiUrl,
        terminalId,
        terminalSecret,
        orderId: request.params.id,
        action: 'receipt',
      });
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
}
