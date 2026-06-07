import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError, forbidden } from '../utils/errors.js';
import { emitVenueConfigUpdated } from '../plugins/socket.js';
import {
  getVenueConfig,
  getTerminalVenueSettings,
  updateVenueConfig,
  listVenueConfigAudits,
} from '../services/venue-config-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

const tableSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1).max(50),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  seats: z.number().int().min(1).max(20),
});

const updateConfigSchema = z.object({
  nameEn: z.string().min(1).max(255).optional(),
  nameAr: z.string().min(1).max(255).optional(),
  type: z.enum(['standard', 'anchor']).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  taxInclusive: z.boolean().optional(),
  receiptTemplate: z.enum(['standard', 'compact', 'detailed']).optional(),
  kitchenPrinterHost: z.string().max(255).nullable().optional(),
  kitchenPrinterPort: z.number().int().min(1).max(65535).optional(),
  receiptPrinterHost: z.string().max(255).nullable().optional(),
  receiptPrinterPort: z.number().int().min(1).max(65535).optional(),
  tableLayout: z.object({ tables: z.array(tableSchema) }).optional(),
});

export async function managerVenueConfigRoutes(app) {
  app.get(
    '/api/v1/manager/venues/:id/config',
    { preHandler: hubManagerPreHandler },
    async (request) => getVenueConfig(request.params.id),
  );

  app.patch(
    '/api/v1/manager/venues/:id/config',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = updateConfigSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const result = await updateVenueConfig(request.params.id, parsed.data, request.user.sub);

      if (request.server.io && result.changes.length > 0) {
        emitVenueConfigUpdated(request.server.io, {
          venueId: request.params.id,
          changes: result.changes,
          config: result.config,
        });
      }
      return result;
    },
  );

  app.get(
    '/api/v1/manager/venues/:id/config/audits',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const limit = Number(request.query?.limit ?? 20);
      return listVenueConfigAudits(request.params.id, { limit });
    },
  );

  app.get(
    '/api/v1/venues/:venueId/settings',
    { preHandler: authenticateTerminal },
    async (request) => {
      const venueId = request.params.venueId;
      if (request.terminal.venueId !== venueId) {
        throw forbidden('Terminal cannot read another venue');
      }
      return getTerminalVenueSettings(venueId);
    },
  );
}
