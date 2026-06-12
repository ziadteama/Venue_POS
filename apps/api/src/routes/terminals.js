import { z } from 'zod';
import { authenticateTerminal } from '../middleware/terminal.js';
import { touchTerminalSeen } from '../services/manager-health-service.js';
import {
  getTerminalRoster,
  terminalReconnectHandshake,
} from '../services/terminal-roster-service.js';
import { setTerminalKioskExitPin } from '../services/kiosk-pin-service.js';
import { validationError } from '../utils/errors.js';

const reconnectSchema = z.object({
  lastSyncAt: z.string().datetime().optional(),
  menuVersionHash: z.string().optional(),
});

const kioskExitPinSchema = z.object({
  kioskExitPin: z.string().min(4).max(8).regex(/^\d+$/),
});

const heartbeatSchema = z.object({
  syncQueueDepth: z.coerce.number().int().min(0).optional(),
  deviceLabel: z.string().max(100).optional(),
  lanHost: z.string().max(255).optional(),
  lanPort: z.coerce.number().int().min(1).max(65535).optional(),
  agentPriority: z.coerce.number().int().optional(),
  clusterMode: z.string().max(32).optional(),
});

export async function terminalRoutes(app) {
  app.post(
    '/api/v1/terminals/heartbeat',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = heartbeatSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

      const depth =
        parsed.data.syncQueueDepth ??
        request.body?.syncQueueDepth ??
        request.headers['x-sync-queue-depth'];

      await touchTerminalSeen(request.terminal.id, {
        syncQueueDepth: depth,
        deviceLabel: parsed.data.deviceLabel,
        lanHost: parsed.data.lanHost,
        lanPort: parsed.data.lanPort,
        agentPriority: parsed.data.agentPriority,
        clusterMode: parsed.data.clusterMode,
      });

      return {
        ok: true,
        terminalId: request.terminal.id,
        deviceLabel: request.terminal.name ?? parsed.data.deviceLabel ?? null,
      };
    },
  );

  app.get(
    '/api/v1/terminals/roster',
    { preHandler: authenticateTerminal },
    async (request) => {
      const roster = await getTerminalRoster(request.terminal.venueId, request.terminal.id);
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
      return terminalReconnectHandshake(request.terminal.venueId, request.terminal.id, parsed.data);
    },
  );

  app.put(
    '/api/v1/terminals/me/kiosk-exit-pin',
    { preHandler: authenticateTerminal },
    async (request) => {
      const parsed = kioskExitPinSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const updated = await setTerminalKioskExitPin(
        request.terminal.id,
        parsed.data.kioskExitPin,
      );
      return { ok: true, terminalId: updated.id, venueId: updated.venueId };
    },
  );
}
