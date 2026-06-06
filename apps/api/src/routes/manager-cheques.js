import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { emitOrderVoided } from '../plugins/socket.js';
import {
  listOpenCheques,
  getCheque,
  voidChequeRound,
  voidOpenCheque,
} from '../services/cheque-service.js';

const managerPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER);

const voidSchema = z.object({
  managerPin: z.string().min(4).max(6),
  reason: z.string().min(1).max(500),
});

function resolveVenueId(request) {
  const queryVenue = request.query?.venueId;
  if (queryVenue && request.user.role === ROLES.HUB_MANAGER) return queryVenue;
  return request.user.venue_id;
}

export async function managerChequeRoutes(app) {
  app.get(
    '/api/v1/manager/cheques/open',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return listOpenCheques(venueId);
    },
  );

  app.get(
    '/api/v1/manager/cheques/:id',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return getCheque(request.params.id, venueId);
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/void',
    { preHandler: managerPreHandler },
    async (request) => {
      const parsed = voidSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const result = await voidOpenCheque(request.params.id, parsed.data, venueId);
      if (request.server.io) {
        for (const orderId of result.voidedOrderIds) {
          emitOrderVoided(request.server.io, {
            orderId,
            venueId,
            reason: parsed.data.reason.trim(),
            voidedBy: request.user.sub,
          });
        }
      }
      return result.cheque;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/orders/:orderId/void',
    { preHandler: managerPreHandler },
    async (request) => {
      const parsed = voidSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const result = await voidChequeRound(
        request.params.id,
        request.params.orderId,
        parsed.data,
        venueId,
      );
      if (request.server.io && result.voidedOrderId) {
        emitOrderVoided(request.server.io, {
          orderId: result.voidedOrderId,
          venueId,
          reason: parsed.data.reason.trim(),
          voidedBy: request.user.sub,
        });
      }
      return result.cheque;
    },
  );
}
