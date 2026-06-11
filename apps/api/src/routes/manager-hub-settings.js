import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { resolveHubFeatures, updateHubFeatures } from '../services/hub-settings-service.js';
import { emitVenueConfigUpdated } from '../plugins/socket.js';

const hubConfigPreHandler = requireRoles(ROLES.SYSTEM_ADMIN);

const featuresSchema = z
  .object({
    manualCardPayment: z.boolean().optional(),
    manualCardApprovalThreshold: z.number().min(0).optional(),
    kdsEnabled: z.boolean().optional(),
    lineTransfer: z.boolean().optional(),
    discounts: z.boolean().optional(),
    refunds: z.boolean().optional(),
    autoReceiptPrint: z.boolean().optional(),
    crossVenueBilling: z.boolean().optional(),
  })
  .strict();

export async function managerHubSettingsRoutes(app) {
  app.get(
    '/api/v1/manager/hub-settings/features',
    { preHandler: hubConfigPreHandler },
    async () => resolveHubFeatures(),
  );

  app.put(
    '/api/v1/manager/hub-settings/features',
    { preHandler: hubConfigPreHandler },
    async (request) => {
      const parsed = featuresSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const features = await updateHubFeatures(parsed.data);
      emitVenueConfigUpdated(request.server.io, {
        venueId: null,
        changes: ['features'],
        config: { features },
      });
      return features;
    },
  );
}
