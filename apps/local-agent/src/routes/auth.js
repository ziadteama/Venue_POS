import { apiFetch } from '../services/api-fetch.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  verifyCachedPin,
  verifyCachedManagerPin,
  syncTerminalRosterFromServer,
} from '../services/terminal-cache.js';

export function registerAuthRoutes(app, { db, getRuntimeConfig }) {
  app.post('/v1/auth/pin', async (request, reply) => {
    const { pin } = request.body ?? {};
    if (!pin || String(pin).length < 4) {
      return reply.status(400).send({ error: 'PIN required (4+ digits)' });
    }

    const { apiUrl, venueId, terminalId, terminalSecret } = getRuntimeConfig();

    if (isCloudOnline()) {
      try {
        const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/auth/pin', {
          method: 'POST',
          body: JSON.stringify({ pin }),
        });
        await syncTerminalRosterFromServer({
          db,
          apiUrl,
          venueId,
          terminalId,
          terminalSecret,
        }).catch((err) => app.log.warn({ err }, 'Roster cache refresh after login failed'));
        return result;
      } catch (err) {
        app.log.warn({ err }, 'Cloud PIN login failed — trying cached roster');
      }
    }

    const cached = await verifyCachedPin(db, String(pin));
    if (!cached) {
      return reply.status(401).send({ error: { message: 'Invalid PIN' } });
    }

    return {
      offline: true,
      user: {
        id: cached.id,
        username: cached.username,
        role: cached.role,
        venueId,
      },
      terminalId,
    };
  });

  app.post('/v1/auth/verify-manager-pin', async (request, reply) => {
    const { pin } = request.body ?? {};
    if (!pin || String(pin).length < 4) {
      return reply.status(400).send({ error: 'PIN required (4+ digits)' });
    }

    const manager = await verifyCachedManagerPin(db, String(pin));
    if (!manager) {
      return reply.status(401).send({ error: { message: 'Invalid manager PIN' } });
    }

    return {
      ok: true,
      user: { id: manager.id, username: manager.username, role: manager.role },
    };
  });
}
