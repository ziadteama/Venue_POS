import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { emitApprovalRequested, emitApprovalResolved } from '../plugins/socket.js';
import {
  listApprovalRequests,
  approveRequest,
  rejectRequest,
  countPendingApprovals,
  requestChequeDiscount,
  requestChequeRefund,
} from '../services/cheque-service.js';

const managerPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER);
const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

const rejectSchema = z.object({
  rejectReason: z.string().max(500).optional(),
});

const discountRequestSchema = z.object({
  amount: z.number().positive().optional(),
  percent: z.number().positive().max(100).optional(),
  reason: z.string().min(1).max(500),
  restaurantManagerPin: z.string().min(4).max(6).optional(),
});

const refundRequestSchema = z.object({
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

export async function managerApprovalRoutes(app) {
  app.get(
    '/api/v1/manager/approval-requests',
    { preHandler: managerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      const status = request.query?.status ?? 'pending';
      return listApprovalRequests(venueId, { status });
    },
  );

  app.get(
    '/api/v1/manager/approval-requests/count',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      const count = await countPendingApprovals(venueId);
      return { count };
    },
  );

  app.post(
    '/api/v1/manager/approval-requests/:id/approve',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const outcome = await approveRequest(request.params.id, request.user.sub, venueId);
      if (request.server.io) {
        emitApprovalResolved(request.server.io, {
          venueId,
          terminalId: outcome.request.terminalId,
          request: outcome.request,
          result: outcome.result,
        });
      }
      return outcome;
    },
  );

  app.post(
    '/api/v1/manager/approval-requests/:id/reject',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = rejectSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const rejected = await rejectRequest(
        request.params.id,
        request.user.sub,
        venueId,
        parsed.data.rejectReason,
      );
      if (request.server.io) {
        emitApprovalResolved(request.server.io, {
          venueId,
          terminalId: rejected.terminalId,
          request: rejected,
          result: null,
        });
      }
      return rejected;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/discount/request',
    { preHandler: managerPreHandler },
    async (request) => {
      const parsed = discountRequestSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      if (!parsed.data.amount && !parsed.data.percent) {
        throw validationError('amount or percent required');
      }

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const initiatorId =
        request.user.role === ROLES.VENUE_MANAGER ? request.user.sub : undefined;

      const created = await requestChequeDiscount(
        request.params.id,
        {
          ...parsed.data,
          cashierId: request.user.sub,
          initiatorId,
          restaurantManagerPin: parsed.data.restaurantManagerPin,
        },
        venueId,
      );

      if (request.server.io) {
        emitApprovalRequested(request.server.io, created);
      }
      return created;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/refund/request',
    { preHandler: managerPreHandler },
    async (request) => {
      const parsed = refundRequestSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');

      const initiatorId =
        request.user.role === ROLES.VENUE_MANAGER ? request.user.sub : undefined;

      const created = await requestChequeRefund(
        request.params.id,
        {
          ...parsed.data,
          cashierId: request.user.sub,
          initiatorId,
          restaurantManagerPin: parsed.data.restaurantManagerPin,
        },
        venueId,
      );

      if (request.server.io) {
        emitApprovalRequested(request.server.io, created);
      }
      return created;
    },
  );
}
