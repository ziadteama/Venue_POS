import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { emitManagerAction, emitOrderVoided, emitRefundNotification } from '../plugins/socket.js';
import {
  applyChequeDiscount,
  applyChequeRefund,
  changeChequeDiscount,
  removeAppliedChequeDiscount,
} from '../services/manager-action-service.js';
import {
  listOpenCheques,
  listChequesForVenue,
  listCrossVenueChequeGroups,
  getCheque,
  voidChequeRound,
  voidOpenCheque,
  compChequeItem,
  listTransferAudits,
  listDiscountAudits,
  listRefundAudits,
} from '../services/cheque-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);
const chequeActionPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER);

const hubActionSchema = z.object({
  managerPin: z.string().min(4).max(6).optional(),
  reason: z.string().min(1).max(500),
});

const discountSchema = z.object({
  amount: z.number().positive().optional(),
  percent: z.number().positive().max(100).optional(),
  reason: z.string().min(1).max(500),
});

const removeDiscountSchema = z.object({
  reason: z.string().min(1).max(500),
});

const refundSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
  reason: z.string().min(1).max(500),
});

function resolveVenueId(request) {
  if (request.user.role === ROLES.VENUE_MANAGER) {
    return request.user.venue_id;
  }
  return request.query?.venueId || request.user.venue_id;
}

function hubActor(request, body) {
  const actor = { ...body };
  if (request.user.role === ROLES.HUB_MANAGER) {
    actor.initiatorId = request.user.sub;
    actor.cashierId = request.user.sub;
  }
  return actor;
}

export async function managerChequeRoutes(app) {
  app.get(
    '/api/v1/manager/cheques/open',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return listOpenCheques(venueId);
    },
  );

  app.get(
    '/api/v1/manager/cheques',
    { preHandler: hubManagerPreHandler },
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
        q: request.query?.q,
      });
    },
  );

  app.get(
    '/api/v1/manager/cheques/cross-venue',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const status = request.query?.status ?? 'open';
      if (!['open', 'paid'].includes(status)) {
        throw validationError('Invalid status filter');
      }
      return listCrossVenueChequeGroups({
        status,
        limit: Number(request.query?.limit ?? 50),
      });
    },
  );

  app.get(
    '/api/v1/manager/cheques/:id',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return getCheque(request.params.id, venueId);
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/void',
    { preHandler: chequeActionPreHandler },
    async (request) => {
      const parsed = hubActionSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const result = await voidOpenCheque(
        request.params.id,
        hubActor(request, parsed.data),
        venueId,
      );
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
      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          type: 'void',
          chequeId: request.params.id,
          result: result.cheque,
        });
      }
      return result.cheque;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/orders/:orderId/void',
    { preHandler: chequeActionPreHandler },
    async (request) => {
      const parsed = hubActionSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const result = await voidChequeRound(
        request.params.id,
        request.params.orderId,
        hubActor(request, parsed.data),
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
      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          type: 'void',
          chequeId: request.params.id,
          result: result.cheque,
        });
      }
      return result.cheque;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/orders/:orderId/items/:itemId/comp',
    { preHandler: chequeActionPreHandler },
    async (request) => {
      const parsed = hubActionSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const cheque = await compChequeItem(
        request.params.id,
        request.params.orderId,
        request.params.itemId,
        hubActor(request, parsed.data),
        venueId,
      );
      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId,
          type: 'comp',
          chequeId: request.params.id,
          result: cheque,
        });
      }
      return cheque;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/discount',
    { preHandler: chequeActionPreHandler },
    async (request) => {
      const parsed = discountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      if (!parsed.data.amount && !parsed.data.percent) {
        throw validationError('amount or percent required');
      }

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const cheque = await applyChequeDiscount(
        request.params.id,
        hubActor(request, parsed.data),
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
    { preHandler: chequeActionPreHandler },
    async (request) => {
      const parsed = discountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      if (!parsed.data.amount && !parsed.data.percent) {
        throw validationError('amount or percent required');
      }

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const cheque = await changeChequeDiscount(
        request.params.id,
        hubActor(request, parsed.data),
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
    { preHandler: chequeActionPreHandler },
    async (request) => {
      const parsed = removeDiscountSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const cheque = await removeAppliedChequeDiscount(
        request.params.id,
        hubActor(request, parsed.data),
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
    { preHandler: chequeActionPreHandler },
    async (request) => {
      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const result = await applyChequeRefund(
        request.params.id,
        hubActor(request, parsed.data),
        venueId,
      );
      if (request.server.io) {
        emitRefundNotification(request.server.io, {
          venueId,
          chequeNumber: result.cheque?.chequeNumber,
          amount: result.refund?.amount,
          method: result.refund?.method,
          reason: parsed.data.reason,
          managerName: result.manager?.username ?? request.user?.username,
          source: 'dashboard',
        });
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

  app.get(
    '/api/v1/manager/cheques/transfers',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return listTransferAudits(venueId);
    },
  );

  app.get(
    '/api/v1/manager/discounts',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return listDiscountAudits(venueId);
    },
  );

  app.get(
    '/api/v1/manager/refunds',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      return listRefundAudits(venueId);
    },
  );
}
