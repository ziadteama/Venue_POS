import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { emitVenueConfigUpdated } from '../plugins/socket.js';
import { getHubBilling, updateHubBilling } from '../services/hub-billing-service.js';
import { prisma } from '../db/prisma.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

const updateSchema = z.object({
  taxRate: z.number().min(0).max(1).optional(),
  taxInclusive: z.boolean().optional(),
  serviceRate: z.number().min(0).max(1).optional(),
  serviceEnabled: z.boolean().optional(),
});

async function broadcastHubBillingToTerminals(io, config) {
  if (!io?.to) return;
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  for (const { id: venueId } of venues) {
    emitVenueConfigUpdated(io, {
      venueId,
      changes: ['hubBilling'],
      config: { hubBilling: config },
    });
  }
}

export async function managerHubBillingRoutes(app) {
  app.get(
    '/api/v1/manager/hub/billing',
    { preHandler: hubManagerPreHandler },
    async () => getHubBilling(),
  );

  app.patch(
    '/api/v1/manager/hub/billing',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = updateSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const config = await updateHubBilling(parsed.data);
      await broadcastHubBillingToTerminals(request.server.io, config);
      return config;
    },
  );
}
