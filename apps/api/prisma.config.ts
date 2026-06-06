import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'node src/db/seed.js',
  },
  // DATABASE_URL comes from schema.prisma + .env — not required for `prisma generate`
  // (CI lint/build run npm ci without a database).
});
