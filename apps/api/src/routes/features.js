import { authenticateTerminal } from '../middleware/terminal.js';
import { config } from '../config.js';

export async function featureRoutes(app) {
  app.get('/api/v1/features', { preHandler: authenticateTerminal }, async () => ({
    manualCardPayment: config.featureManualCardEnabled,
    manualCardApprovalThreshold: config.manualCardApprovalThreshold,
    kdsEnabled: config.featureKdsEnabled,
  }));
}
