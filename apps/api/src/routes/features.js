import { prisma } from '../db/prisma.js';
import { authenticateTerminal } from '../middleware/terminal.js';
import { listHubTableLabels } from '../services/hub-table-service.js';
import { getEnabledTargets } from '../services/billing-config-service.js';
import { resolveHubFeatures, resolveHubDeployment } from '../services/hub-settings-service.js';

export async function featureRoutes(app) {
  app.get('/api/v1/features', { preHandler: authenticateTerminal }, async (request) => {
    const venueId = request.terminal.venueId;
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { type: true, nameEn: true, nameAr: true },
    });
    const tables = await listHubTableLabels();

    const hubFeatures = await resolveHubFeatures();
    const deployment = await resolveHubDeployment();
    const crossVenueTargets = hubFeatures.crossVenueBilling
      ? await getEnabledTargets(venueId)
      : [];

    return {
      manualCardPayment: hubFeatures.manualCardPayment,
      manualCardApprovalThreshold: hubFeatures.manualCardApprovalThreshold,
      kdsEnabled: hubFeatures.kdsEnabled,
      lineTransfer: hubFeatures.lineTransfer,
      discounts: hubFeatures.discounts,
      refunds: hubFeatures.refunds,
      autoReceiptPrint: hubFeatures.autoReceiptPrint,
      tables,
      crossVenueBilling: hubFeatures.crossVenueBilling && crossVenueTargets.length > 0,
      isAnchor: venue?.type === 'anchor',
      crossVenueTargets,
      anchorVenue:
        venue?.type === 'anchor'
          ? { id: venueId, nameEn: venue.nameEn, nameAr: venue.nameAr }
          : null,
      posUpdate: deployment.posUpdateFeedUrl
        ? {
            feedUrl: deployment.posUpdateFeedUrl,
            targetVersion: deployment.posUpdateTargetVersion || null,
          }
        : null,
    };
  });
}
