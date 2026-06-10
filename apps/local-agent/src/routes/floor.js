import { CLUSTER_MODES } from '@venue-pos/shared';
import { apiFetch } from '../services/api-fetch.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  listFloorLocks,
  occupyFloorLock,
  releaseFloorLock,
} from '../services/floor-locks.js';
import { lanFetch } from '../services/lan-fetch.js';
import { publishAgentEvent } from '../services/agent-events.js';

function relayFloorEvent(result) {
  if (!result?.tableLabel) return;
  publishAgentEvent('floor:table_updated', {
    tableLabel: result.tableLabel,
    floorTableId: result.floorTableId ?? result.id ?? null,
    occupiedByChequeId: result.occupiedByChequeId ?? result.chequeId ?? null,
    occupiedCrossVenueGroupId: result.occupiedCrossVenueGroupId ?? null,
    isOccupied: result.isOccupied ?? Boolean(result.occupiedByChequeId ?? result.chequeId),
    venueId: result.venueId ?? null,
    updatedAt: result.updatedAt ?? new Date().toISOString(),
  });
}

function isLeaderNode(ctx) {
  const cluster = ctx.getClusterState?.() ?? {};
  return cluster.mode === CLUSTER_MODES.LEADER || ctx.isCoordinator;
}

function getLeaderHost(ctx) {
  const cluster = ctx.getClusterState?.() ?? {};
  const coordinatorHost = ctx.getCoordinatorLanHost?.() ?? ctx.coordinatorLanHost ?? '';
  if (cluster.mode === CLUSTER_MODES.FOLLOWER && cluster.leaderHost) return cluster.leaderHost;
  if (ctx.coordinatorFallback && coordinatorHost) return coordinatorHost;
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
      const { tableLabel, floorTableId, chequeId, crossVenueGroupId, venueId } = request.body ?? {};
      if (!tableLabel && !floorTableId) {
        return reply.status(400).send({ error: 'tableLabel or floorTableId required' });
      }
      if (isCloudOnline()) {
        const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables/occupy', {
          method: 'POST',
          body: JSON.stringify({ tableLabel, floorTableId, chequeId, crossVenueGroupId, venueId }),
        });
        relayFloorEvent(result);
        return result;
      }
      const leaderHost = getLeaderHost(routeCtx);
      if (leaderHost) {
        try {
          const result = await lanFetch(leaderHost, '/v1/floor/tables/occupy', {
            lanPort: routeCtx.lanPort,
            lanSecret: routeCtx.lanSecret,
            method: 'POST',
            body: { tableLabel, floorTableId, chequeId, crossVenueGroupId, terminalId, venueId },
          });
          relayFloorEvent(result);
          return result;
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
        const result = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/floor/tables/release', {
          method: 'POST',
          body: JSON.stringify({ tableLabel, chequeId }),
        });
        relayFloorEvent(result ?? { tableLabel, isOccupied: false });
        return result;
      }
      const leaderHost = getLeaderHost(routeCtx);
      if (leaderHost) {
        try {
          const result = await lanFetch(leaderHost, '/v1/floor/tables/release', {
            lanPort: routeCtx.lanPort,
            lanSecret: routeCtx.lanSecret,
            method: 'POST',
            body: { tableLabel, chequeId },
          });
          relayFloorEvent(result ?? { tableLabel, isOccupied: false });
          return result;
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
    const { tableLabel, floorTableId, chequeId, venueId } = request.body ?? {};
    if (!tableLabel && !floorTableId) {
      return reply.status(400).send({ error: 'tableLabel or floorTableId required' });
    }
    try {
      return occupyFloorLock(db, {
        tableLabel,
        floorTableId,
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
