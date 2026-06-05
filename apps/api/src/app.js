import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.logLevel },
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  registerErrorHandler(app);
  await app.register(healthRoutes);
  await app.register(authRoutes);

  return app;
}
