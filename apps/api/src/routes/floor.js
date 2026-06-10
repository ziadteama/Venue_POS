import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import {
  listFloorTables,
  occupyFloorTable,
  releaseFloorTable,
} from '../services/floor-table-service.js';

const occupySchema = z.object({
  tableLabel: z.string().min(1).max(50).optional(),
  floorTableId: z.string().uuid().optional(),
  chequeId: z.string().uuid().optional(),
  crossVenueGroupId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
}).refine((d) => d.tableLabel || d.floorTableId, { message: 'tableLabel or floorTableId required' });

export async function floorRoutes(app) {
  app.get('/api/v1/floor/tables', { preHandler: authenticateTerminal }, async () => {
    return listFloorTables();
  });

  app.post('/api/v1/floor/tables/occupy', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = occupySchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    return occupyFloorTable({
      ...parsed.data,
      terminalId: request.terminal.id,
      io: request.server.io,
    });
  });

  app.post('/api/v1/floor/tables/release', { preHandler: authenticateTerminal }, async (request) => {
    const parsed = occupySchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    return releaseFloorTable({
      tableLabel: parsed.data.tableLabel,
      chequeId: parsed.data.chequeId,
      io: request.server.io,
    });
  });
}
