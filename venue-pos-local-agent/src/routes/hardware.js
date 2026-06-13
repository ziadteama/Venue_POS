import {
  getReceiptPrinterHealth,
  isCashDrawerEnabled,
  probeReceiptPrinterHealth,
} from '../services/receipt-printer.js';
import { openCashDrawerManual } from '../services/cash-drawer.js';

export function registerHardwareRoutes(app, routeCtx) {
  const { db, getPrinterConfig } = routeCtx;

  app.post('/v1/hardware/open-drawer', async (request, reply) => {
    if (!isCashDrawerEnabled()) {
      return reply.status(503).send({ error: 'Cash drawer disabled' });
    }
    const { cashierId } = request.body ?? {};
    const printers = getPrinterConfig();
    const receiptHealth = getReceiptPrinterHealth();
    if (receiptHealth.ok === false && receiptHealth.message !== 'not_configured') {
      return reply.status(503).send({ error: 'Receipt printer offline' });
    }
    try {
      const result = await openCashDrawerManual({
        db,
        cashierId,
        log: app.log,
        host: printers.receiptPrinterHost,
        port: printers.receiptPrinterPort,
      });
      return result;
    } catch (err) {
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  app.get('/v1/hardware/receipt-printer/health', async () => {
    const printers = getPrinterConfig();
    return probeReceiptPrinterHealth({
      host: printers.receiptPrinterHost,
      port: printers.receiptPrinterPort,
    });
  });
}
