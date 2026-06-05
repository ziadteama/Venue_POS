import { prisma } from '../db/prisma.js';

export async function healthRoutes(app) {
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  app.get('/health/ready', async (_, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected' };
    } catch {
      return reply.status(503).send({ status: 'not_ready', database: 'disconnected' });
    }
  });
}
