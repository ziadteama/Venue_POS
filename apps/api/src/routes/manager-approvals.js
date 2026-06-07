import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { emitManagerAction } from '../plugins/socket.js';
import {
  approveRefundRequest,
  listApprovalRequests,
  rejectRefundRequest,
} from '../services/approval-request-service.js';
import { forceChequeRefund } from '../services/manager-action-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

const rejectSchema = z.object({
  rejectReason: z.string().min(1).max(500),
});

const forceRefundSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
  reason: z.string().min(1).max(500),
  managerPin: z.string().min(4).max(6).optional(),
});

function resolveVenueFilter(request) {
  const queryVenue = request.query?.venueId;
  if (!queryVenue) return undefined;
  if (request.user.role === ROLES.HUB_MANAGER) return queryVenue;
  return queryVenue;
}

export async function managerApprovalsRoutes(app) {
  app.get(
    '/api/v1/manager/approvals',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      const status = request.query?.status ?? 'pending';
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        throw validationError('Invalid status');
      }
      const type = request.query?.type ?? 'refund';
      if (type !== 'refund') throw validationError('Invalid type');
      const limit = Number(request.query?.limit ?? 50);
      return listApprovalRequests(venueId, { status, type, limit });
    },
  );

  app.post(
    '/api/v1/manager/approvals/:id/approve',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueFilter(request);
      const result = await approveRefundRequest(request.params.id, request.user.sub, {
        venueId,
      });

      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId: result.request.venueId,
          terminalId: result.request.terminalId ?? undefined,
          type: 'refund',
          chequeId: result.request.chequeId,
          result,
        });
      }
      return result;
    },
  );

  app.post(
    '/api/v1/manager/approvals/:id/reject',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = rejectSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = resolveVenueFilter(request);
      const requestRow = await rejectRefundRequest(request.params.id, request.user.sub, {
        rejectReason: parsed.data.rejectReason,
        venueId,
      });

      if (request.server.io) {
        emitManagerAction(request.server.io, {
          venueId: requestRow.venueId,
          type: 'refund_rejected',
          chequeId: requestRow.chequeId,
          result: requestRow,
        });
      }
      return requestRow;
    },
  );

  app.post(
    '/api/v1/manager/cheques/:id/refund/force',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = forceRefundSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const venueId = request.query?.venueId;
      if (!venueId) throw validationError('venueId is required');

      const result = await forceChequeRefund(
        request.params.id,
        {
          ...parsed.data,
          approverId: request.user.sub,
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
