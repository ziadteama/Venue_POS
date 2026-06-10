import { Server } from 'socket.io';
import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { touchTerminalSeen } from '../services/manager-health-service.js';

export function registerSocket(app) {
  const io = new Server(app.server, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const { token, terminalId, terminalSecret, clientType } = socket.handshake.auth ?? {};
      socket.data.clientType = clientType ?? 'pos';

      if (socket.data.clientType === 'kds' && !config.featureKdsEnabled) {
        return next(new Error('Kitchen display is disabled for this deployment'));
      }

      if (terminalId && terminalSecret) {
        const terminal = await prisma.terminal.findUnique({ where: { id: terminalId } });
        if (!terminal?.isActive) return next(new Error('Invalid terminal'));
        const valid = await bcrypt.compare(terminalSecret, terminal.secretHash);
        if (!valid) return next(new Error('Invalid terminal'));
        socket.data.terminal = terminal;
        socket.data.role = 'terminal';
        return next();
      }

      if (token) {
        const payload = verifyAccessToken(token);
        socket.data.user = payload;
        socket.data.role = payload.role;
        return next();
      }

      return next(new Error('Unauthorized'));
    } catch (err) {
      return next(err);
    }
  });

  io.on('connection', (socket) => {
    if (socket.data.terminal) {
      const { id, venueId } = socket.data.terminal;
      touchTerminalSeen(id).catch(() => {});
      socket.join(`venue:${venueId}`);
      socket.join(`terminal:${id}`);
      if (socket.data.clientType === 'kds') {
        socket.join(`venue:${venueId}:kitchen`);
      } else {
        socket.join(`venue:${venueId}:pos`);
      }
    } else if (socket.data.user?.venue_id) {
      const skipVenueRoom =
        socket.data.clientType === 'dashboard' &&
        ['hub_owner', 'hub_manager'].includes(socket.data.role);
      if (!skipVenueRoom) {
        socket.join(`venue:${socket.data.user.venue_id}`);
      }
    }
    if (
      ['hub_owner', 'hub_manager'].includes(socket.data.role) &&
      socket.data.clientType === 'dashboard'
    ) {
      socket.join('dashboard:hub');
    }
  });

  app.io = io;
  app.log.info('Socket.IO attached');
}

export function emitMenuUpdated(io, { venueId, versionHash, publishedAt }) {
  io.to(`venue:${venueId}`).emit('menu:updated', {
    event: 'menu:updated',
    payload: { venueId, versionHash, publishedAt },
  });
}

export function emitOrderCreated(io, order) {
  if (!config.featureKdsEnabled) return;
  io.to(`venue:${order.venueId}:kitchen`).emit('order:created', {
    event: 'order:created',
    payload: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      venueId: order.venueId,
      tableId: order.tableLabel,
      tableLabel: order.tableLabel,
      items: order.items,
      status: order.status,
      sentAt: order.sentAt,
    },
  });
}

export function emitOrderVoided(io, { orderId, venueId, reason, voidedBy }) {
  const payload = {
    orderId,
    venueId,
    reason,
    voidedBy,
    voidedAt: new Date().toISOString(),
  };
  if (config.featureKdsEnabled) {
    io.to(`venue:${venueId}:kitchen`).emit('order:voided', { event: 'order:voided', payload });
  }
  io.to(`venue:${venueId}:pos`).emit('order:voided', { event: 'order:voided', payload });
}

export function emitManagerNotification(io, { venueId, type, payload }) {
  if (!io) return;
  const message = {
    type,
    venueId,
    ...payload,
    at: new Date().toISOString(),
  };
  io.to(`venue:${venueId}:pos`).emit('manager:notification', {
    event: 'manager:notification',
    payload: message,
  });
  io.to('dashboard:hub').emit('manager:notification', {
    event: 'manager:notification',
    payload: message,
  });
}

export function emitRefundNotification(
  io,
  {
    venueId,
    terminalId,
    chequeNumber,
    amount,
    method,
    reason,
    managerName,
    cashierName,
    source = 'pos',
  },
) {
  emitManagerNotification(io, {
    venueId,
    type: 'refund',
    payload: {
      chequeNumber,
      amount,
      method,
      reason,
      managerName,
      cashierName,
      source,
      terminalId: terminalId ?? null,
    },
  });
}

export function emitDiscountNotification(
  io,
  {
    venueId,
    terminalId,
    chequeNumber,
    action = 'discount',
    amount,
    reason,
    cashierName,
    managerName,
    source = 'pos',
  },
) {
  emitManagerNotification(io, {
    venueId,
    type: 'discount',
    payload: {
      action,
      chequeNumber,
      amount,
      reason,
      cashierName,
      managerName,
      source,
      terminalId: terminalId ?? null,
    },
  });
}

export function emitManagerAction(io, { venueId, terminalId, type, chequeId, result }) {
  const payload = { type, chequeId, result, at: new Date().toISOString() };
  io.to('dashboard:hub').emit('manager:action', {
    event: 'manager:action',
    payload,
  });
  io.to(`venue:${venueId}:pos`).emit('manager:action', {
    event: 'manager:action',
    payload,
  });
  if (terminalId) {
    io.to(`terminal:${terminalId}`).emit('manager:action', {
      event: 'manager:action',
      payload,
    });
  }
}

export function emitVenueConfigUpdated(io, { venueId, changes, config }) {
  const payload = {
    venueId,
    changes,
    config,
    updatedAt: new Date().toISOString(),
  };
  io.to(`venue:${venueId}`).emit('venue:config_updated', {
    event: 'venue:config_updated',
    payload,
  });
  io.to(`venue:${venueId}:pos`).emit('venue:config_updated', {
    event: 'venue:config_updated',
    payload,
  });
  io.to('dashboard:hub').emit('venue:config_updated', {
    event: 'venue:config_updated',
    payload,
  });
}

export function emitHubTablesUpdated(io, { tables }) {
  if (!io?.to) return;
  const payload = {
    tables,
    updatedAt: new Date().toISOString(),
  };
  const message = { event: 'hub:tables_updated', payload };
  io.to('dashboard:hub').emit('hub:tables_updated', message);
  const rooms = io.sockets?.adapter?.rooms;
  if (!rooms) return;
  for (const room of rooms.keys()) {
    if (room.startsWith('venue:') && room.endsWith(':pos')) {
      io.to(room).emit('hub:tables_updated', message);
    }
  }
}

/** Hub-wide floor occupancy — all venue POS rooms (cross-venue shared tables). */
export function emitFloorTableUpdated(io, payload) {
  if (!io?.to) return;
  const message = { event: 'floor:table_updated', payload };
  io.to('dashboard:hub').emit('floor:table_updated', message);
  const rooms = io.sockets?.adapter?.rooms;
  if (!rooms) return;
  for (const room of rooms.keys()) {
    if (room.startsWith('venue:') && room.endsWith(':pos')) {
      io.to(room).emit('floor:table_updated', message);
    }
  }
}

export function emitBillingConfigUpdated(io, { anchorVenueId, targetVenueId, enabled }) {
  const payload = {
    anchorVenueId,
    targetVenueId,
    enabled,
    updatedAt: new Date().toISOString(),
  };
  // Anchor terminals refresh their permitted cross-venue targets.
  io.to(`venue:${anchorVenueId}:pos`).emit('venue:config_updated', {
    event: 'venue:config_updated',
    payload,
  });
  io.to(`venue:${targetVenueId}:pos`).emit('venue:config_updated', {
    event: 'venue:config_updated',
    payload,
  });
  io.to('dashboard:hub').emit('venue:config_updated', {
    event: 'venue:config_updated',
    payload,
  });
}

export function emitCrossVenueLock(io, { groupId, anchorVenueId, cheques }) {
  const payload = { groupId, anchorVenueId, cheques, at: new Date().toISOString() };
  const venueIds = new Set([anchorVenueId, ...cheques.map((c) => c.venueId)]);
  for (const venueId of venueIds) {
    io.to(`venue:${venueId}:pos`).emit('cheque:lock_acquired', {
      event: 'cheque:lock_acquired',
      payload,
    });
  }
  io.to('dashboard:hub').emit('cheque:lock_acquired', {
    event: 'cheque:lock_acquired',
    payload,
  });
}

export function emitCrossVenueBilled(io, { groupId, anchorVenueId, cheques, combinedTotal }) {
  const payload = {
    groupId,
    anchorVenueId,
    combinedTotal,
    cheques,
    at: new Date().toISOString(),
  };
  const venueIds = new Set([anchorVenueId, ...cheques.map((c) => c.venueId)]);
  for (const venueId of venueIds) {
    io.to(`venue:${venueId}:pos`).emit('cheque:cross_billed', {
      event: 'cheque:cross_billed',
      payload,
    });
  }
  io.to('dashboard:hub').emit('cheque:cross_billed', {
    event: 'cheque:cross_billed',
    payload,
  });
}

export function emitOrderItemStatus(io, { order, itemId, kitchenStatus, updatedBy }) {
  const payload = {
    orderId: order.id,
    itemId,
    status: kitchenStatus,
    orderStatus: order.status,
    updatedBy: updatedBy ?? null,
    updatedAt: new Date().toISOString(),
    items: order.items,
  };
  io.to(`venue:${order.venueId}:pos`).emit('order:item_status', {
    event: 'order:item_status',
    payload,
  });
  if (config.featureKdsEnabled) {
    io.to(`venue:${order.venueId}:kitchen`).emit('order:item_status', {
      event: 'order:item_status',
      payload,
    });
  }
}
