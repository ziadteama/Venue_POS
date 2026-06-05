import 'dotenv/config';
import { createDatabase } from './db/sqlite.js';
import { buildAgentServer } from './server.js';

const port = Number(process.env.PORT ?? 3456);
const host = process.env.HOST ?? '127.0.0.1';
const dbPath = process.env.SQLITE_PATH ?? './data/local.db';

const db = createDatabase(dbPath);
const app = await buildAgentServer({ db, port, host });
app.log.info(`Local agent listening on ${host}:${port}`);
