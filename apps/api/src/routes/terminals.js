import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { touchTerminalSeen } from '../services/manager-health-service.js';
import {
  getTerminalRoster,
  terminalReconnectHandshake,
} from '../services/terminal-roster-service.js';
import { validationError } from '../utils/errors.js';

const reconnectSchema = z.object({
  lastSyncAt: z.string().datetime().optional(),
  menuVersionHash: z.string().optional(),
});

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

  app.get(
    '/api/v1/terminals/roster',
    { preHandler: authenticateTerminal },
    async (request) => {
      const roster = await getTerminalRoster(request.terminal.venueId);
      if (!roster) throw validationError('Venue not found');
      return roster;
    },
  );

  app.post(
    '/api/v1/terminals/reconnect',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = reconnectSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return terminalReconnectHandshake(request.terminal.venueId, parsed.data);
    },
  );
}
