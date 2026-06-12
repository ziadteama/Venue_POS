import { subscribeAgentEvents } from '../services/agent-events.js';

function resolveSseCorsOrigin(request, corsOrigins) {
  const origin = request.headers.origin;
  if (!origin) return corsOrigins[0] ?? '*';
  if (corsOrigins.includes('*')) return origin;
  if (corsOrigins.includes(origin)) return origin;
  return corsOrigins[0] ?? origin;
}

export function registerEventRoutes(app, { corsOrigins = ['*'] } = {}) {
  app.options('/v1/events/stream', async (request, reply) => {
    const allowOrigin = resolveSseCorsOrigin(request, corsOrigins);
    return reply
      .header('Access-Control-Allow-Origin', allowOrigin)
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .header('Access-Control-Allow-Headers', 'content-type')
      .status(204)
      .send();
  });

  app.get('/v1/events/stream', async (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    const allowOrigin = resolveSseCorsOrigin(request, corsOrigins);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': allowOrigin,
      Vary: 'Origin',
    });
    res.write(': connected\n\n');

    const send = ({ event, payload }) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const unsubscribe = subscribeAgentEvents(send);
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
