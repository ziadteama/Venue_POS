import { authenticateTerminal } from '../middleware/terminal.js';
import { touchTerminalSeen } from '../services/manager-health-service.js';

export async function terminalRoutes(app) {
  app.post(
    '/api/v1/terminals/heartbeat',
    { preHandler: authenticateTerminal },
    async (request) => {
      const depth = request.body?.syncQueueDepth ?? request.headers['x-sync-queue-depth'];
      await touchTerminalSeen(request.terminal.id, { syncQueueDepth: depth });
      return { ok: true, terminalId: request.terminal.id };
    },
  );
}
