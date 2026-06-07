import { prisma } from '../db/prisma.js';
import { authenticateTerminal } from '../middleware/terminal.js';
import { config } from '../config.js';
import { serializeVenueTableLabels } from '../utils/venue-tables.js';

export async function featureRoutes(app) {
  app.get('/api/v1/features', { preHandler: authenticateTerminal }, async (request) => {
    const venue = await prisma.venue.findUnique({
      where: { id: request.terminal.venueId },
      select: { tables: true },
    });

    return {
      manualCardPayment: config.featureManualCardEnabled,
      manualCardApprovalThreshold: config.manualCardApprovalThreshold,
      kdsEnabled: config.featureKdsEnabled,
      lineTransfer: config.featureLineTransferEnabled,
      discounts: config.featureDiscountsEnabled,
      refunds: config.featureRefundsEnabled,
      autoReceiptPrint: config.featureAutoReceiptPrint,
      tables: serializeVenueTableLabels(venue?.tables),
    };
  });
}
