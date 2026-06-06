/**
 * Node 20 helpers for Windows (nvm) and native-module rebuilds.
 *
 * CLI:
 *   node scripts/node20.mjs setup              # rebuild better-sqlite3 + bcrypt
 *   node scripts/node20.mjs --watch src/index.js # run a script with Node 20
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string | null} Directory containing node.exe for nvm Node 20.x */
export function findNvmNode20Dir() {
  const roots = [
    process.env.NVM_HOME,
    'C:\\Program Files\\nvm',
    path.join(process.env.APPDATA ?? '', 'nvm'),
  ].filter(Boolean);

  for (const nvmRoot of roots) {
    if (!existsSync(nvmRoot)) continue;
    const versions = readdirSync(nvmRoot)
      .filter((name) => /^v20\.\d+\.\d+$/.test(name))
      .sort()
      .reverse();
    for (const ver of versions) {
      const dir = path.join(nvmRoot, ver);
      if (existsSync(path.join(dir, 'node.exe'))) return dir;
    }
  }
  return null;
}

/** Prefer nvm Node 20; fall back to the active binary when already on Node 20. */
export function resolveNode20Exe() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major === 20) return process.execPath;
  const dir = findNvmNode20Dir();
  return dir ? path.join(dir, 'node.exe') : null;
}

export function node20PathEnv(baseEnv = process.env) {
  const dir = findNvmNode20Dir();
  if (!dir) return baseEnv;
  return { ...baseEnv, PATH: `${dir};${baseEnv.PATH ?? ''}` };
}

/** Re-exec the current script under Node 20 when the shell has another version. */
export function ensureNode20Process(scriptPath, argv, cwd = repoRoot) {
  const node20 = resolveNode20Exe();
  if (!node20) return { ok: false, env: process.env };

  const env = node20PathEnv();
  if (process.execPath !== node20) {
    console.log(`Using Node 20 (${node20}) — shell has ${process.version}`);
    const result = spawnSync(node20, [scriptPath, ...argv], {
      stdio: 'inherit',
      env,
      cwd,
    });
    process.exit(result.status ?? 1);
  }

  return { ok: true, env };
}

function failNode20Required() {
  console.error(`Node ${process.version} is active; Node 20 is required.`);
  console.error('Install: nvm install 20   then run: npm run setup:node20');
  process.exit(1);
}

function runSetup() {
  const node20 = resolveNode20Exe();
  if (!node20) failNode20Required();

  const nodeDir = path.dirname(node20);
  const env = node20PathEnv();
  const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');

  console.log(`Rebuilding native modules with ${node20}…`);
  for (const pkg of ['better-sqlite3', 'bcrypt']) {
    const result = spawnSync(node20, [npmCli, 'rebuild', pkg], {
      cwd: repoRoot,
      stdio: 'inherit',
      env,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  console.log('Done. Run: npm run dev');
}

function runScript(args) {
  const node20 = resolveNode20Exe();
  if (!node20) failNode20Required();
  if (!args.length) {
    console.error('Usage: node scripts/node20.mjs [--watch] <script> [args…]');
    process.exit(1);
  }

  const result = spawnSync(node20, args, {
    stdio: 'inherit',
    env: node20PathEnv(),
    cwd: process.cwd(),
  });
  process.exit(result.status ?? 1);
}

const selfPath = fileURLToPath(import.meta.url);
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(selfPath);

if (isMain) {
  const [first, ...rest] = process.argv.slice(2);
  if (first === 'setup') runSetup();
  else runScript(first ? [first, ...rest] : rest);
}
