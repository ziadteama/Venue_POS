import { apiFetch } from '../services/api-fetch.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  listFloorLocks,
  occupyFloorLock,
  releaseFloorLock,
} from '../services/floor-locks.js';

export function registerFloorRoutes(
  app,
  { db, isCoordinator, apiUrl, terminalId, terminalSecret, coordinatorLanHost, coordinatorFallback },
) {
  if (!isCoordinator) {
    app.get('/v1/floor/tables', async () => {
      if (isCloudOnline()) {
        return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables');
      }
      if (coordinatorFallback && coordinatorLanHost) {
        const res = await fetch(`http://${coordinatorLanHost}:3456/v1/floor/tables`);
        if (!res.ok) throw new Error('Coordinator floor unavailable');
        return res.json();
      }
      return [];
    });
    return;
  }

  app.get('/v1/floor/tables', async () => listFloorLocks(db));

  app.post('/v1/floor/tables/occupy', async (request, reply) => {
    const { tableLabel, chequeId, venueId } = request.body ?? {};
    if (!tableLabel) return reply.status(400).send({ error: 'tableLabel required' });
    try {
      return occupyFloorLock(db, {
        tableLabel,
        chequeId,
        terminalId: request.body?.terminalId,
        venueId,
      });
    } catch (err) {
      return reply.status(409).send({ error: err.message });
    }
  });

  app.post('/v1/floor/tables/release', async (request, reply) => {
    const { tableLabel, chequeId } = request.body ?? {};
    if (!tableLabel) return reply.status(400).send({ error: 'tableLabel required' });
    return releaseFloorLock(db, { tableLabel, chequeId });
  });
}
