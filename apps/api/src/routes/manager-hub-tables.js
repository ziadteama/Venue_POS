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
      // #region agent log
      fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',hypothesisId:'H5',location:'manager-hub-tables.js:delete',message:'delete ok broadcasting',data:{deletedId:request.params.id,hasIo:Boolean(request.server.io)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      await broadcastHubTablesUpdated(request.server.io);
      return result;
    },
  );
}
