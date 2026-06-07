import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { emitCrossVenueLock, emitCrossVenueBilled } from '../plugins/socket.js';
import {
  listCrossVenueBillableCheques,
  createCrossVenueGroup,
  getCrossVenueGroup,
  cancelCrossVenueGroup,
  payCrossVenueGroup,
} from '../services/cross-venue-service.js';

const createGroupSchema = z.object({
  cashierId: z.string().uuid(),
  chequeIds: z.array(z.string().uuid()).min(1).max(20),
});

const payGroupSchema = z.object({
  cashierId: z.string().uuid(),
  method: z.enum(['cash', 'card', 'voucher']).optional(),
  cardLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  tendered: z.number().positive().optional(),
  managerPin: z.string().min(4).max(6).optional(),
});

const cancelGroupSchema = z.object({
  cashierId: z.string().uuid().optional(),
});

export async function crossVenueRoutes(app) {
  app.get(
    '/api/v1/cross-venue/billable',
    { preHandler: authenticateTerminal },
    async (request) => listCrossVenueBillableCheques(request.terminal.venueId),
  );

  app.post(
    '/api/v1/cross-venue/groups',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = createGroupSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const group = await createCrossVenueGroup({
        anchorVenueId: request.terminal.venueId,
        anchorTerminalId: request.terminal.id,
        cashierId: parsed.data.cashierId,
        chequeIds: parsed.data.chequeIds,
      });

      if (request.server.io) {
        emitCrossVenueLock(request.server.io, {
          groupId: group.groupId,
          anchorVenueId: group.anchorVenueId,
          cheques: group.cheques.map((c) => ({ id: c.id, venueId: c.venueId })),
        });
      }
      return group;
    },
  );

  app.get(
    '/api/v1/cross-venue/groups/:groupId',
    { preHandler: authenticateTerminal },
    async (request) =>
      getCrossVenueGroup(request.params.groupId, request.terminal.venueId),
  );

  app.post(
    '/api/v1/cross-venue/groups/:groupId/cancel',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = cancelGroupSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return cancelCrossVenueGroup(request.params.groupId, request.terminal.venueId, {
        cashierId: parsed.data.cashierId,
      });
    },
  );

  app.post(
    '/api/v1/cross-venue/groups/:groupId/pay',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = payGroupSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const result = await payCrossVenueGroup({
        groupId: request.params.groupId,
        anchorVenueId: request.terminal.venueId,
        anchorTerminalId: request.terminal.id,
        cashierId: parsed.data.cashierId,
        method: parsed.data.method,
        cardLast4: parsed.data.cardLast4,
        tendered: parsed.data.tendered,
        managerPin: parsed.data.managerPin,
      });

      if (request.server.io) {
        emitCrossVenueBilled(request.server.io, {
          groupId: result.group.groupId,
          anchorVenueId: result.group.anchorVenueId,
          combinedTotal: result.combinedTotal,
          cheques: result.group.cheques.map((c) => ({
            id: c.id,
            venueId: c.venueId,
            total: c.total,
          })),
        });
      }
      return result;
    },
  );
}
