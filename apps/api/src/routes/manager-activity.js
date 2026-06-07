import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { emitManagerAction } from '../plugins/socket.js';
import {
  applyChequeDiscount,
  applyChequeRefund,
  changeChequeDiscount,
  listManagerActivity,
  removeAppliedChequeDiscount,
} from '../services/manager-action-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

const discountSchema = z.object({
  amount: z.number().positive().optional(),
  percent: z.number().positive().max(100).optional(),
  reason: z.string().min(1).max(500),
  restaurantManagerPin: z.string().min(4).max(6).optional(),
});

const removeDiscountSchema = z.object({
  reason: z.string().min(1).max(500),
  restaurantManagerPin: z.string().min(4).max(6).optional(),
});

const refundSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
  reason: z.string().min(1).max(500),
  restaurantManagerPin: z.string().min(4).max(6).optional(),
});

function resolveVenueId(request) {
  const queryVenue = request.query?.venueId;
  if (queryVenue && request.user.role === ROLES.HUB_MANAGER) return queryVenue;
  return request.user.venue_id;
}

export async function managerActivityRoutes(app) {
  app.get(
    '/api/v1/manager/activity',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      const limit = Number(request.query?.limit ?? 100);
      return listManagerActivity(venueId, { limit });
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/discount',
    { preHandler: requireRoles(ROLES.VENUE_MANAGER) },
    async (request) => {
      const parsed = discountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      if (!parsed.data.amount && !parsed.data.percent) {
        throw validationError('amount or percent required');
      }

      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');

      const cheque = await applyChequeDiscount(
        request.params.id,
        {
          ...parsed.data,
          cashierId: request.user.sub,
          initiatorId: request.user.sub,
        },
        venueId,
      );

      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          type: 'discount',
          chequeId: request.params.id,
          result: cheque,
        });
      }
      return cheque;
    },
  );

  app.patch(
    '/api/v1/manager/cheques/:id/discount',
    { preHandler: requireRoles(ROLES.VENUE_MANAGER) },
    async (request) => {
      const parsed = discountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      if (!parsed.data.amount && !parsed.data.percent) {
        throw validationError('amount or percent required');
      }

      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');

      const cheque = await changeChequeDiscount(
        request.params.id,
        {
          ...parsed.data,
          cashierId: request.user.sub,
          initiatorId: request.user.sub,
        },
        venueId,
      );

      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          type: 'discount_change',
          chequeId: request.params.id,
          result: cheque,
        });
      }
      return cheque;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/discount/remove',
    { preHandler: requireRoles(ROLES.VENUE_MANAGER) },
    async (request) => {
      const parsed = removeDiscountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');

      const cheque = await removeAppliedChequeDiscount(
        request.params.id,
        {
          ...parsed.data,
          cashierId: request.user.sub,
          initiatorId: request.user.sub,
        },
        venueId,
      );

      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          type: 'discount_remove',
          chequeId: request.params.id,
          result: cheque,
        });
      }
      return cheque;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/refund',
    { preHandler: requireRoles(ROLES.VENUE_MANAGER) },
    async (request) => {
      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');

      const result = await applyChequeRefund(
        request.params.id,
        {
          ...parsed.data,
          cashierId: request.user.sub,
          initiatorId: request.user.sub,
        },
        venueId,
      );

      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          type: 'refund',
          chequeId: request.params.id,
          result,
        });
      }
      return result;
    },
  );
}
