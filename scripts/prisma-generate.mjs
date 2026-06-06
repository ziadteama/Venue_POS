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
const apiDir = path.join(root, 'apps', 'api');
const enginePath = path.join(
  root,
  'node_modules',
  '.prisma',
  'client',
  'query_engine-windows.dll.node',
);
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');

function runGenerate() {
  return spawnSync(process.execPath, [prismaCli, 'generate'], {
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

let result = runGenerate();

if (result.status !== 0 && process.platform === 'win32') {
  if (unlockWindowsEngine()) {
    result = runGenerate();
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
