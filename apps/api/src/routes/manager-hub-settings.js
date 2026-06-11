import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import {
  resolveHubFeatures,
  resolveHubDeployment,
  updateHubFeatures,
  updateHubDeployment,
} from '../services/hub-settings-service.js';
import { emitTerminalUpdateAvailable, emitVenueConfigUpdated } from '../plugins/socket.js';

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

const deploymentSchema = z
  .object({
    posUpdateFeedUrl: z.union([z.string().url(), z.literal('')]).optional(),
    posUpdateTargetVersion: z.string().max(64).optional(),
    notifyTerminalsOnSave: z.boolean().optional(),
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

  app.get(
    '/api/v1/manager/hub-settings/deployment',
    { preHandler: hubConfigPreHandler },
    async () => resolveHubDeployment(),
  );

  app.put(
    '/api/v1/manager/hub-settings/deployment',
    { preHandler: hubConfigPreHandler },
    async (request) => {
      const parsed = deploymentSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const deployment = await updateHubDeployment(parsed.data);
      if (parsed.data.notifyTerminalsOnSave !== false && deployment.posUpdateFeedUrl) {
        emitTerminalUpdateAvailable(request.server.io, {
          feedUrl: deployment.posUpdateFeedUrl,
          targetVersion: deployment.posUpdateTargetVersion || null,
        });
      }
      emitVenueConfigUpdated(request.server.io, {
        venueId: null,
        changes: ['deployment'],
        config: { deployment },
      });
      return deployment;
    },
  );

  app.post(
    '/api/v1/manager/hub-settings/deployment/notify',
    { preHandler: hubConfigPreHandler },
    async (request) => {
      const deployment = await resolveHubDeployment();
      if (!deployment.posUpdateFeedUrl) {
        throw validationError('POS update feed URL is not configured');
      }
      emitTerminalUpdateAvailable(request.server.io, {
        feedUrl: deployment.posUpdateFeedUrl,
        targetVersion: deployment.posUpdateTargetVersion || null,
      });
      return { ok: true, notifiedAt: new Date().toISOString() };
    },
  );
}
