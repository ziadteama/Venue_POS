import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@venue-pos/shared';
import { apiFetch, sendApiError } from '../services/api-fetch.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  getCoordinatorGroup,
  startCoordinatorGroup,
  addCoordinatorGroupItem,
  editCoordinatorGroupItem,
  removeCoordinatorGroupItem,
  fireCoordinatorGroup,
  payCoordinatorGroup,
  newGroupId,
} from '../services/coordinator-cross-venue.js';
import { enqueueSync } from '../services/sync-processor.js';
import { SYNC_EVENT_TYPES } from '@venue-pos/shared';
import { getLinkedMenuCache } from '../services/linked-menu-sync.js';
import { proxyToCoordinator } from '../services/coordinator-proxy.js';
import { printCustomerReceipt } from '../services/kitchen-printer.js';

function offlineCrossSell(reply) {
  return reply.status(403).send({
    error: {
      code: ERROR_CODES.OFFLINE_MODE,
      message: 'Cross-sell requires hub connection or LAN coordinator (Slice C)',
    },
  });
}

/**
 * Cross-venue ordering is online-only: an anchor terminal builds one order
 * spanning linked venues, fires each venue's kitchen, and pays once. These
 * routes proxy to the central API (no local SQLite cache).
 */
export function registerCrossVenueRoutes(app, routeCtx) {
  const {
    db,
    apiUrl,
    venueId,
    terminalId,
    terminalSecret,
    getPrinterConfig,
    autoReceiptPrint,
    isCoordinator,
    getCoordinatorLanHost,
    coordinatorFallback,
    getClusterState,
  } = routeCtx;

  const coordinatorHost = () => getCoordinatorLanHost?.() ?? routeCtx.coordinatorLanHost ?? '';

  const canCoordinatorOffline = () => {
    const cluster = getClusterState?.() ?? {};
    return (
      !isCloudOnline() &&
      (cluster.isLeader || isCoordinator || (coordinatorFallback && coordinatorHost()))
    );
  };

  async function maybeProxy(path, options) {
    const cluster = getClusterState?.() ?? {};
    if (!isCloudOnline()) {
      if (cluster.isLeader || isCoordinator) return null;
      if (cluster.leaderHost || (coordinatorFallback && coordinatorHost())) {
        return proxyToCoordinator(routeCtx, path, options);
      }
    }
    return null;
  }
  app.get('/v1/cross-venue/cheques/:chequeId/group', async (request, reply) => {
    if (!isCloudOnline() && isCoordinator) {
      const row = db
        .prepare(`SELECT id FROM cross_venue_groups WHERE anchor_cheque_id = ? LIMIT 1`)
        .get(request.params.chequeId);
      if (row) return getCoordinatorGroup(db, row.id);
    }
    if (!isCloudOnline()) return offlineCrossSell(reply);
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
    if (!isCloudOnline()) {
      const cached = getLinkedMenuCache(db, request.params.venueId);
      if (cached) return cached;
      if (isCoordinator) return reply.status(404).send({ error: 'Linked menu not cached' });
    }
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/menu/${request.params.venueId}`,
      );
    } catch (err) {
      const cached = getLinkedMenuCache(db, request.params.venueId);
      if (cached) return cached;
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/order', async (request, reply) => {
    const { cashierId } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const proxied = await maybeProxy('/v1/cross-venue/order', {
      method: 'POST',
      body: JSON.stringify(request.body),
    });
    if (proxied) return proxied;
    if (canCoordinatorOffline() && isCoordinator) {
      const groupId = newGroupId();
      return startCoordinatorGroup(db, {
        groupId,
        anchorVenueId: venueId,
        anchorTerminalId: terminalId,
        cashierId,
        tableLabel: request.body?.tableLabel,
      });
    }
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cross-venue/order', {
        method: 'POST',
        body: JSON.stringify(request.body),
      });
    } catch (err) {
      if (canCoordinatorOffline()) return offlineCrossSell(reply);
      return sendApiError(reply, err);
    }
  });

  app.get('/v1/cross-venue/order/:groupId', async (request, reply) => {
    const proxied = await maybeProxy(`/v1/cross-venue/order/${request.params.groupId}`);
    if (proxied) return proxied;
    if (!isCloudOnline() && isCoordinator) {
      const group = getCoordinatorGroup(db, request.params.groupId);
      if (group) return group;
    }
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
    const { cashierId, venueId, menuItemId, quantity, modifiers } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    if (!venueId) return reply.status(400).send({ error: 'venueId required' });
    if (!menuItemId) return reply.status(400).send({ error: 'menuItemId required' });
    const proxied = await maybeProxy(`/v1/cross-venue/order/${request.params.groupId}/items`, {
      method: 'POST',
      body: JSON.stringify(request.body),
    });
    if (proxied) return proxied;
    if (canCoordinatorOffline() && isCoordinator) {
      try {
        return addCoordinatorGroupItem(db, request.params.groupId, {
          venueId,
          menuItemId,
          quantity,
          modifiers,
        });
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/items`,
        { method: 'POST', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      if (canCoordinatorOffline()) return offlineCrossSell(reply);
      return sendApiError(reply, err);
    }
  });

  app.patch('/v1/cross-venue/order/:groupId/items/:itemId', async (request, reply) => {
    const venueId = request.query?.venueId;
    if (!venueId) return reply.status(400).send({ error: 'venueId query required' });
    const proxied = await maybeProxy(
      `/v1/cross-venue/order/${request.params.groupId}/items/${request.params.itemId}?venueId=${venueId}`,
      { method: 'PATCH', body: JSON.stringify(request.body) },
    );
    if (proxied) return proxied;
    if (canCoordinatorOffline() && isCoordinator) {
      try {
        return editCoordinatorGroupItem(db, request.params.groupId, {
          venueId,
          itemId: request.params.itemId,
          quantity: request.body?.quantity,
        });
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/items/${request.params.itemId}?venueId=${venueId}`,
        { method: 'PATCH', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      if (canCoordinatorOffline()) return offlineCrossSell(reply);
      return sendApiError(reply, err);
    }
  });

  app.delete('/v1/cross-venue/order/:groupId/items/:itemId', async (request, reply) => {
    const venueId = request.query?.venueId;
    if (!venueId) return reply.status(400).send({ error: 'venueId query required' });
    const proxied = await maybeProxy(
      `/v1/cross-venue/order/${request.params.groupId}/items/${request.params.itemId}?venueId=${venueId}`,
      { method: 'DELETE' },
    );
    if (proxied) return proxied;
    if (canCoordinatorOffline() && isCoordinator) {
      try {
        return removeCoordinatorGroupItem(db, request.params.groupId, {
          venueId,
          itemId: request.params.itemId,
        });
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/items/${request.params.itemId}?venueId=${venueId}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      if (canCoordinatorOffline()) return offlineCrossSell(reply);
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/cross-venue/order/:groupId/fire', async (request, reply) => {
    const { cashierId, venueId } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const proxied = await maybeProxy(`/v1/cross-venue/order/${request.params.groupId}/fire`, {
      method: 'POST',
      body: JSON.stringify(request.body),
    });
    if (proxied) return proxied;
    if (canCoordinatorOffline() && isCoordinator) {
      try {
        const result = fireCoordinatorGroup(db, request.params.groupId, { venueId });
        const printers = getPrinterConfig();
        for (const sent of result.sentOrders ?? []) {
          printCustomerReceipt(
            `KITCHEN ${sent.venueId}\n${sent.items.map((i) => `${i.quantity}x ${i.nameEn}`).join('\n')}`,
            {
              host: printers.kitchenPrinterHost,
              port: printers.kitchenPrinterPort,
              log: app.log,
            },
          ).catch(() => {});
        }
        return result;
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
    try {
      return await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/cross-venue/order/${request.params.groupId}/fire`,
        { method: 'POST', body: JSON.stringify(request.body) },
      );
    } catch (err) {
      if (canCoordinatorOffline()) return offlineCrossSell(reply);
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
    const { cashierId, payments, method, tendered, managerPin } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const syncId = randomUUID();
    const proxied = await maybeProxy(`/v1/cross-venue/order/${request.params.groupId}/pay`, {
      method: 'POST',
      body: JSON.stringify(request.body),
    });
    if (proxied) return proxied;
    if (canCoordinatorOffline() && isCoordinator) {
      try {
        const result = payCoordinatorGroup(db, request.params.groupId, {
          cashierId,
          payments,
          method,
          tendered,
          managerPin,
        });
        enqueueSync(
          db,
          SYNC_EVENT_TYPES.CROSS_VENUE_GROUP_REPLAY,
          result.replayPayload,
          syncId,
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
      } catch (localErr) {
        return reply.status(400).send({ error: localErr.message });
      }
    }
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
      if (canCoordinatorOffline()) return offlineCrossSell(reply);
      return sendApiError(reply, err);
    }
  });
}
