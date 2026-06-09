import { isCloudOnline } from '../services/cloud-health.js';
import { apiFetch } from '../services/api-fetch.js';

function requireLanSecret(request, reply) {
  const secret = process.env.AGENT_LAN_SECRET ?? '';
  if (!secret) return true;
  if (request.headers['x-agent-lan-secret'] === secret) return true;
  reply.status(401).send({ error: 'Unauthorized' });
  return false;
}

export function registerPeerRoutes(app, { clusterManager, getOwnLanHost }) {
  app.post('/v1/peer/health', async (request, reply) => {
    if (!requireLanSecret(request, reply)) return;
    const remote = request.body ?? {};
    const remoteHost = request.ip?.replace('::ffff:', '') ?? remote.host;
    const response = clusterManager.applyRemoteGossip(remote, remoteHost);
    return { ...response, host: getOwnLanHost() };
  });

  app.get('/v1/peer/health', async (request, reply) => {
    if (!requireLanSecret(request, reply)) return;
    return { ...clusterManager.buildGossipPayload(), host: getOwnLanHost() };
  });
}

export function registerRelayRoutes(app, { apiUrl }) {
  app.post('/v1/relay/sync', async (request, reply) => {
    if (!requireLanSecret(request, reply)) return;
    if (!isCloudOnline()) {
      return reply.status(503).send({ error: 'Relay unavailable — cloud offline on this node' });
    }
    const terminalId = request.headers['x-terminal-id'];
    const terminalSecret = request.headers['x-terminal-secret'];
    if (!terminalId || !terminalSecret) {
      return reply.status(400).send({ error: 'x-terminal-id and x-terminal-secret required' });
    }
    const { events } = request.body ?? {};
    if (!events?.length) return reply.status(400).send({ error: 'events required' });
    return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/sync/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
    });
  });

  app.post('/v1/relay/floor/:action', async (request, reply) => {
    if (!requireLanSecret(request, reply)) return;
    if (!isCloudOnline()) {
      return reply.status(503).send({ error: 'Relay unavailable — cloud offline on this node' });
    }
    const terminalId = request.headers['x-terminal-id'];
    const terminalSecret = request.headers['x-terminal-secret'];
    if (!terminalId || !terminalSecret) {
      return reply.status(400).send({ error: 'x-terminal-id and x-terminal-secret required' });
    }
    const action = request.params.action;
    const path =
      action === 'occupy'
        ? '/api/v1/floor/tables/occupy'
        : action === 'release'
          ? '/api/v1/floor/tables/release'
          : null;
    if (!path) return reply.status(400).send({ error: 'Invalid floor action' });
    return apiFetch(apiUrl, terminalId, terminalSecret, path, {
      method: 'POST',
      body: JSON.stringify(request.body ?? {}),
    });
  });

  app.post('/v1/relay/api', async (request, reply) => {
    if (!requireLanSecret(request, reply)) return;
    if (!isCloudOnline()) {
      return reply.status(503).send({ error: 'Relay unavailable — cloud offline on this node' });
    }
    const terminalId = request.headers['x-terminal-id'];
    const terminalSecret = request.headers['x-terminal-secret'];
    if (!terminalId || !terminalSecret) {
      return reply.status(400).send({ error: 'x-terminal-id and x-terminal-secret required' });
    }
    const { path, method = 'GET', body } = request.body ?? {};
    if (!path?.startsWith('/api/v1/')) {
      return reply.status(400).send({ error: 'Invalid relay path' });
    }
    return apiFetch(apiUrl, terminalId, terminalSecret, path, {
      method,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  });
}
