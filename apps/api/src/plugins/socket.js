import { Server } from 'socket.io';
import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { verifyAccessToken } from '../utils/jwt.js';

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
      socket.join(`venue:${venueId}`);
      socket.join(`terminal:${id}`);
      if (socket.data.clientType === 'kds') {
        socket.join(`venue:${venueId}:kitchen`);
      } else {
        socket.join(`venue:${venueId}:pos`);
      }
    } else if (socket.data.user?.venue_id) {
      socket.join(`venue:${socket.data.user.venue_id}`);
    }
    if (socket.data.role === 'hub_manager') {
      socket.join('dashboard:hub_manager');
    }
  });

  app.io = io;
  app.log.info('Socket.IO attached');
}

export function emitMenuUpdated(io, { templateId, venueIds, versionHash, publishedAt }) {
  for (const venueId of venueIds) {
    io.to(`venue:${venueId}`).emit('menu:updated', {
      event: 'menu:updated',
      payload: { templateId, venueIds, versionHash, publishedAt },
    });
  }
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
