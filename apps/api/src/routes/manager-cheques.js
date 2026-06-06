import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { emitOrderVoided } from '../plugins/socket.js';
import {
  listOpenCheques,
  listChequesForVenue,
  getCheque,
  voidChequeRound,
  voidOpenCheque,
  compChequeItem,
  listTransferAudits,
  applyChequeDiscount,
  processRefund,
  listDiscountAudits,
  listRefundAudits,
} from '../services/cheque-service.js';

const managerPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER);

const managerActionSchema = z.object({
  managerPin: z.string().min(4).max(6),
  reason: z.string().min(1).max(500),
});

const dualManagerSchema = z.object({
  restaurantManagerPin: z.string().min(4).max(6),
  generalManagerPin: z.string().min(4).max(6),
  reason: z.string().min(1).max(500),
});

const discountSchema = dualManagerSchema.extend({
  amount: z.number().positive().optional(),
  percent: z.number().positive().max(100).optional(),
});

const refundSchema = dualManagerSchema.extend({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
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
    '/api/v1/manager/cheques',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      const status = request.query?.status ?? 'open';
      if (!['open', 'paid', 'voided'].includes(status)) {
        throw validationError('Invalid status filter');
      }
      return listChequesForVenue(venueId, {
        status,
        limit: Number(request.query?.limit ?? 50),
      });
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
      const parsed = managerActionSchema.safeParse(request.body);
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
      const parsed = managerActionSchema.safeParse(request.body);
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

  app.post(
    '/api/v1/manager/cheques/:id/orders/:orderId/items/:itemId/comp',
    { preHandler: managerPreHandler },
    async (request) => {
      const parsed = managerActionSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      return compChequeItem(
        request.params.id,
        request.params.orderId,
        request.params.itemId,
        parsed.data,
        venueId,
      );
    },
  );

  app.get(
    '/api/v1/manager/cheques/transfers',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return listTransferAudits(venueId);
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/discount',
    { preHandler: managerPreHandler },
    async (request) => {
      const parsed = discountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      if (!parsed.data.amount && !parsed.data.percent) {
        throw validationError('amount or percent required');
      }

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      return applyChequeDiscount(
        request.params.id,
        { ...parsed.data, cashierId: request.user.sub },
        venueId,
      );
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/refund',
    { preHandler: managerPreHandler },
    async (request) => {
      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      return processRefund(
        request.params.id,
        { ...parsed.data, cashierId: request.user.sub },
        venueId,
      );
    },
  );

  app.get(
    '/api/v1/manager/discounts',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return listDiscountAudits(venueId);
    },
  );

  app.get(
    '/api/v1/manager/refunds',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return listRefundAudits(venueId);
    },
  );
}
