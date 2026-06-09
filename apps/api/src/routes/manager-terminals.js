import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { requireRoles } from '../middleware/auth.js';
import { validationError, notFound } from '../utils/errors.js';
import { emitVenueConfigUpdated } from '../plugins/socket.js';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isCoordinator: z.boolean().optional(),
  coordinatorLanHost: z.string().max(255).nullable().optional(),
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

      return terminals.map((t) => ({
        id: t.id,
        name: t.name,
        venueId: t.venueId,
        venueNameEn: t.venue.nameEn,
        venueNameAr: t.venue.nameAr,
        isCoordinator: t.isCoordinator,
        coordinatorLanHost: t.coordinatorLanHost,
        lastSeenAt: t.lastSeenAt?.toISOString() ?? null,
        syncQueueDepth: t.syncQueueDepth,
        lastLanHost: t.lastLanHost,
        lastLanPort: t.lastLanPort,
        lastAgentPriority: t.lastAgentPriority,
        lastClusterMode: t.lastClusterMode,
      }));
    },
  );

  app.patch(
    '/api/v1/manager/terminals/:id',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

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
            ? { coordinatorLanHost: parsed.data.coordinatorLanHost }
            : {}),
        },
      });

      if (request.server.io) {
        emitVenueConfigUpdated(request.server.io, {
          venueId: updated.venueId,
          changes: ['coordinator'],
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
      };
    },
  );
}
