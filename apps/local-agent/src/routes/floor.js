import { CLUSTER_MODES } from '@venue-pos/shared';
import { apiFetch } from '../services/api-fetch.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  listFloorLocks,
  occupyFloorLock,
  releaseFloorLock,
} from '../services/floor-locks.js';
import { lanFetch } from '../services/lan-fetch.js';

function isLeaderNode(ctx) {
  const cluster = ctx.getClusterState?.() ?? {};
  return cluster.mode === CLUSTER_MODES.LEADER || ctx.isCoordinator;
}

function getLeaderHost(ctx) {
  const cluster = ctx.getClusterState?.() ?? {};
  if (cluster.mode === CLUSTER_MODES.FOLLOWER && cluster.leaderHost) return cluster.leaderHost;
  if (ctx.coordinatorFallback && ctx.coordinatorLanHost) return ctx.coordinatorLanHost;
  return null;
}

export function registerFloorRoutes(app, routeCtx) {
  const { db, apiUrl, terminalId, terminalSecret } = routeCtx;

  if (!isLeaderNode(routeCtx)) {
    app.get('/v1/floor/tables', async () => {
      if (isCloudOnline()) {
        return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables');
      }
      const leaderHost = getLeaderHost(routeCtx);
      if (leaderHost) {
        return lanFetch(leaderHost, '/v1/floor/tables', {
          lanPort: routeCtx.lanPort,
          lanSecret: routeCtx.lanSecret,
        });
      }
      return [];
    });

    app.post('/v1/floor/tables/occupy', async (request, reply) => {
      const { tableLabel, chequeId, venueId } = request.body ?? {};
      if (!tableLabel) return reply.status(400).send({ error: 'tableLabel required' });
      if (isCloudOnline()) {
        return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables/occupy', {
          method: 'POST',
          body: JSON.stringify({ tableLabel, chequeId }),
        });
      }
      const leaderHost = getLeaderHost(routeCtx);
      if (leaderHost) {
        try {
          return await lanFetch(leaderHost, '/v1/floor/tables/occupy', {
            lanPort: routeCtx.lanPort,
            lanSecret: routeCtx.lanSecret,
            method: 'POST',
            body: { tableLabel, chequeId, terminalId, venueId },
          });
        } catch (err) {
          return reply.status(err.statusCode ?? 503).send({ error: err.message });
        }
      }
      return reply.status(503).send({ error: 'Floor sync unavailable offline' });
    });

    app.post('/v1/floor/tables/release', async (request, reply) => {
      const { tableLabel, chequeId } = request.body ?? {};
      if (!tableLabel) return reply.status(400).send({ error: 'tableLabel required' });
      if (isCloudOnline()) {
        return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables/release', {
          method: 'POST',
          body: JSON.stringify({ tableLabel, chequeId }),
        });
      }
      const leaderHost = getLeaderHost(routeCtx);
      if (leaderHost) {
        try {
          return await lanFetch(leaderHost, '/v1/floor/tables/release', {
            lanPort: routeCtx.lanPort,
            lanSecret: routeCtx.lanSecret,
            method: 'POST',
            body: { tableLabel, chequeId },
          });
        } catch (err) {
          return reply.status(err.statusCode ?? 503).send({ error: err.message });
        }
      }
      return { tableLabel, isOccupied: false };
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
        terminalId: request.body?.terminalId ?? terminalId,
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
