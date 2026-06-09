import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { emitBillingConfigUpdated } from '../plugins/socket.js';
import { listBillingMatrix, setBillingPair } from '../services/billing-config-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

const setPairSchema = z.object({
  anchorVenueId: z.string().uuid(),
  targetVenueId: z.string().uuid(),
  enabled: z.boolean(),
});

export async function managerBillingRoutes(app) {
  app.get(
    '/api/v1/manager/billing-config',
    { preHandler: hubManagerPreHandler },
    async () => listBillingMatrix(),
  );

  app.put(
    '/api/v1/manager/billing-config',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = setPairSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const actor = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { username: true },
      });
      const pair = await setBillingPair({
        ...parsed.data,
        actorId: request.user.sub,
        actorUsername: actor?.username ?? null,
      });

      if (request.server.io) {
        emitBillingConfigUpdated(request.server.io, {
          anchorVenueId: pair.anchorVenueId,
          targetVenueId: pair.targetVenueId,
          enabled: pair.enabled,
        });
      }
      return pair;
    },
  );
}
