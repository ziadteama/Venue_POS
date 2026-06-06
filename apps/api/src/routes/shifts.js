import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { closeShift, getActiveShift, openShift } from '../services/shift-service.js';

const openShiftSchema = z.object({
  cashierId: z.string().uuid(),
  openFloat: z.coerce.number().min(0),
});

const closeShiftSchema = z.object({
  cashierId: z.string().uuid(),
  closeFloat: z.coerce.number().min(0),
  managerPin: z.string().min(4).max(6).optional(),
});

export async function shiftRoutes(app) {
  app.get('/api/v1/shifts/active', { preHandler: authenticateTerminal }, async (request) => {
    const cashierId = request.query.cashierId;
    if (!cashierId) throw validationError('cashierId required');
    const shift = await getActiveShift(cashierId, request.terminal.id, request.terminal.venueId);
    return shift ?? { active: false };
  });

  app.post('/api/v1/shifts/open', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = openShiftSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.message);
    const shift = await openShift({
      ...parsed.data,
      terminalId: request.terminal.id,
      venueId: request.terminal.venueId,
    });
    return shift;
  });

  app.post('/api/v1/shifts/close', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = closeShiftSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.message);
    return closeShift({
      ...parsed.data,
      terminalId: request.terminal.id,
      venueId: request.terminal.venueId,
    });
  });
}
