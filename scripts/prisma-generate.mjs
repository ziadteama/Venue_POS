/**
 * Windows + network-drive safe Prisma generate.
 * Prisma atomically replaces query_engine-windows.dll.node; on mapped drives (Z:)
 * or when a dev server holds the DLL, rename fails with EPERM.
 *
 * Strategy: try generate first; only move the engine aside and retry on failure.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// generate does not connect to the DB; CI lint job has no DATABASE_URL
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://generate:generate@127.0.0.1:5432/generate?schema=public';
}
const apiDir = path.join(root, 'apps', 'api');
const enginePath = path.join(
  root,
  'node_modules',
  '.prisma',
  'client',
  'query_engine-windows.dll.node',
);
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const prismaCliInApi = path.join(apiDir, 'node_modules', 'prisma', 'build', 'index.js');

function resolvePrismaCli() {
  if (existsSync(prismaCli)) return prismaCli;
  if (existsSync(prismaCliInApi)) return prismaCliInApi;
  return null;
}

function runGenerate(cli) {
  return spawnSync(process.execPath, [cli, 'generate'], {
    cwd: apiDir,
    encoding: 'utf8',
  });
}

function unlockWindowsEngine() {
  if (process.platform !== 'win32' || !existsSync(enginePath)) return false;

  const backup = `${enginePath}.bak`;
  try {
    if (existsSync(backup)) {
      renameSync(backup, `${backup}.${Date.now()}`);
    }
    renameSync(enginePath, backup);
    console.log('prisma-generate: moved locked query engine aside, retrying…');
    return true;
  } catch (err) {
    console.warn(
      'prisma-generate: could not move query_engine-windows.dll.node — stop dev servers (dev:api, Prisma Studio), then retry.',
    );
    console.warn(err.message);
    return false;
  }
}

function printOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

const cli = resolvePrismaCli();
if (!cli) {
  console.log(
    'prisma-generate: skipped (prisma CLI not installed — OK for dashboard/Vercel frontend builds)',
  );
  process.exit(0);
}

let result = runGenerate(cli);

if (result.status !== 0 && process.platform === 'win32') {
  if (unlockWindowsEngine()) {
    result = runGenerate(cli);
  }
}

printOutput(result);

if (result.status !== 0) {
  console.error('\nprisma-generate failed.');
  if (process.platform === 'win32' && /^[A-Z]:\\/i.test(root) && !root.startsWith('C:\\')) {
    console.error(
      'Tip: mapped drives (e.g. Z:) often lock Prisma engine files. Clone to C:\\dev\\Venue_POS or run from a local folder if this keeps failing.',
    );
  }
  process.exit(result.status ?? 1);
}
