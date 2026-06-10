import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import {
  broadcastHubTablesUpdated,
  createHubTable,
  deleteHubTable,
  listHubTables,
  updateHubTable,
} from '../services/hub-table-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

const createSchema = z.object({
  tableLabel: z.string().min(1).max(50),
  sortOrder: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  tableLabel: z.string().min(1).max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function managerHubTableRoutes(app) {
  app.get(
    '/api/v1/manager/hub/tables',
    { preHandler: hubManagerPreHandler },
    async () => listHubTables(),
  );

  app.post(
    '/api/v1/manager/hub/tables',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = createSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const row = await createHubTable(parsed.data);
      await broadcastHubTablesUpdated(request.server.io);
      return row;
    },
  );

  app.patch(
    '/api/v1/manager/hub/tables/:id',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = updateSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const row = await updateHubTable(request.params.id, parsed.data);
      await broadcastHubTablesUpdated(request.server.io);
      return row;
    },
  );

  app.delete(
    '/api/v1/manager/hub/tables/:id',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const result = await deleteHubTable(request.params.id);
      await broadcastHubTablesUpdated(request.server.io);
      return result;
    },
  );
}
