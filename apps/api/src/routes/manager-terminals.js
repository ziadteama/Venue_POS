import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { requireRoles } from '../middleware/auth.js';
import { validationError, notFound } from '../utils/errors.js';
import { emitVenueConfigUpdated } from '../plugins/socket.js';
import { isValidLanHost } from '../services/terminal-lan-service.js';
import { serializeTerminalRow } from '../services/manager-terminal-service.js';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isCoordinator: z.boolean().optional(),
  coordinatorLanHost: z.string().max(255).nullable().optional(),
  assignedLanHost: z.string().max(255).nullable().optional(),
});

export async function managerTerminalRoutes(app) {
  app.get(
    '/api/v1/manager/terminals',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const venueId = request.query?.venueId;
      const terminals = await prisma.terminal.findMany({
        where: {
          isActive: true,
          ...(venueId ? { venueId } : {}),
        },
        include: { venue: { select: { id: true, nameEn: true, nameAr: true } } },
        orderBy: [{ venue: { nameEn: 'asc' } }, { name: 'asc' }],
      });

      const now = Date.now();
      return terminals.map((t) => serializeTerminalRow(t, now));
    },
  );

  app.patch(
    '/api/v1/manager/terminals/:id',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      if (
        parsed.data.assignedLanHost != null &&
        parsed.data.assignedLanHost !== '' &&
        !isValidLanHost(parsed.data.assignedLanHost)
      ) {
        throw validationError('Invalid assigned LAN IP address');
      }
      if (
        parsed.data.coordinatorLanHost != null &&
        parsed.data.coordinatorLanHost !== '' &&
        !isValidLanHost(parsed.data.coordinatorLanHost)
      ) {
        throw validationError('Invalid coordinator LAN IP address');
      }

      const terminal = await prisma.terminal.findUnique({ where: { id: request.params.id } });
      if (!terminal?.isActive) throw notFound('Terminal not found');

      if (parsed.data.isCoordinator === true) {
        await prisma.terminal.updateMany({
          where: { isCoordinator: true, id: { not: terminal.id } },
          data: { isCoordinator: false },
        });
      }

      const updated = await prisma.terminal.update({
        where: { id: terminal.id },
        data: {
          ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
          ...(parsed.data.isCoordinator != null
            ? { isCoordinator: parsed.data.isCoordinator }
            : {}),
          ...(parsed.data.coordinatorLanHost !== undefined
            ? { coordinatorLanHost: parsed.data.coordinatorLanHost || null }
            : {}),
          ...(parsed.data.assignedLanHost !== undefined
            ? { assignedLanHost: parsed.data.assignedLanHost || null }
            : {}),
        },
      });

      if (request.server.io) {
        emitVenueConfigUpdated(request.server.io, {
          venueId: updated.venueId,
          changes: ['terminals', 'coordinator'],
          config: {
            coordinatorTerminalId: updated.isCoordinator ? updated.id : null,
            coordinatorLanHost: updated.coordinatorLanHost,
          },
        });
      }

      return {
        id: updated.id,
        name: updated.name,
        isCoordinator: updated.isCoordinator,
        coordinatorLanHost: updated.coordinatorLanHost,
        assignedLanHost: updated.assignedLanHost,
      };
    },
  );
}
