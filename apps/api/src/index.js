import { buildApp } from './app.js';
import { config } from './config.js';
import { disconnectPrisma } from './db/prisma.js';
import { registerSocket } from './plugins/socket.js';
import { startMetricsTicker } from './plugins/metrics-ticker.js';

const app = await buildApp();
let stopMetricsTicker;

async function shutdown() {
  stopMetricsTicker?.();
  if (app.io) app.io.close();
  await app.close();
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
  registerSocket(app);
  stopMetricsTicker = startMetricsTicker(app);
  app.log.info(`API listening on ${config.host}:${config.port}`);
  app.log.info('WebSocket ready at /socket.io');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
