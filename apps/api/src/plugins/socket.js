import { Server } from 'socket.io';
import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma.js';
import { verifyAccessToken } from '../utils/jwt.js';

export function registerSocket(app) {
  const io = new Server(app.server, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const { token, terminalId, terminalSecret } = socket.handshake.auth ?? {};

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
      socket.join(`venue:${venueId}:pos`);
      socket.join(`terminal:${id}`);
    } else if (socket.data.user?.venue_id) {
      socket.join(`venue:${socket.data.user.venue_id}`);
    }
    if (socket.data.role === 'hub_manager') {
      socket.join('dashboard:hub_manager');
    }
  });

  app.io = io;
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
  io.to(`venue:${order.venueId}:kitchen`).emit('order:created', {
    event: 'order:created',
    payload: {
      orderId: order.id,
      venueId: order.venueId,
      tableId: order.tableLabel,
      items: order.items,
      status: order.status,
      sentAt: order.sentAt,
    },
  });
}
