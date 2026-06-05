import { buildApp } from './app.js';
import { config } from './config.js';
import { disconnectPrisma } from './db/prisma.js';

const app = await buildApp();

async function shutdown() {
  await app.close();
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`API listening on ${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
