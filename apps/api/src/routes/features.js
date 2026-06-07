import { prisma } from '../db/prisma.js';
import { authenticateTerminal } from '../middleware/terminal.js';
import { config } from '../config.js';
import { serializeVenueTableLabels } from '../utils/venue-tables.js';
import { getEnabledTargets } from '../services/billing-config-service.js';

export async function featureRoutes(app) {
  app.get('/api/v1/features', { preHandler: authenticateTerminal }, async (request) => {
    const venueId = request.terminal.venueId;
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { tables: true, type: true, nameEn: true, nameAr: true },
    });

    const crossVenueTargets = config.featureCrossVenueBilling
      ? await getEnabledTargets(venueId)
      : [];

    return {
      manualCardPayment: config.featureManualCardEnabled,
      manualCardApprovalThreshold: config.manualCardApprovalThreshold,
      kdsEnabled: config.featureKdsEnabled,
      lineTransfer: config.featureLineTransferEnabled,
      discounts: config.featureDiscountsEnabled,
      refunds: config.featureRefundsEnabled,
      autoReceiptPrint: config.featureAutoReceiptPrint,
      tables: serializeVenueTableLabels(venue?.tables),
      crossVenueBilling: config.featureCrossVenueBilling && crossVenueTargets.length > 0,
      isAnchor: venue?.type === 'anchor',
      crossVenueTargets,
      anchorVenue:
        venue?.type === 'anchor'
          ? { id: venueId, nameEn: venue.nameEn, nameAr: venue.nameAr }
          : null,
    };
  });
}
