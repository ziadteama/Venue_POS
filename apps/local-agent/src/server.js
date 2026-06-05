import Fastify from 'fastify';

export async function buildAgentServer({ db, port, host }) {
  const app = Fastify({ logger: { level: 'info' } });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'local-agent',
    syncQueueDepth: db.prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`).get()
      .n,
    timestamp: new Date().toISOString(),
  }));

  app.get('/v1/status', async () => ({
    online: true,
    sqlite: 'connected',
    version: '0.1.0',
  }));

  await app.listen({ port, host });
  return app;
}
