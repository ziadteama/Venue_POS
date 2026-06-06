/**
 * Start the full local dev stack with one command.
 *
 * Usage:
 *   npm run dev              # API + dashboard + agent + POS (Electron)
 *   npm run dev -- --browser # POS in browser only (no Electron window)
 *   npm run dev -- --kds     # include KDS Vite (:5175)
 *   npm run dev -- --docker  # start Redis container first (optional)
 *
 * Postgres: uses DATABASE_URL in apps/api/.env (pgAdmin or Docker — not started here).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import concurrently from 'concurrently';
import { ensureNode20Process } from './node20.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selfPath = fileURLToPath(import.meta.url);

const { ok, env: devEnv } = ensureNode20Process(selfPath, process.argv.slice(2), root);
if (!ok) {
  console.error(`Node ${process.version} detected; Node 20 required.`);
  console.error('Install: nvm install 20   then: npm run setup:node20');
  process.exit(1);
}
const flags = new Set(process.argv.slice(2));
const withKds = flags.has('--kds');
const withDocker = flags.has('--docker');
const browserOnly = flags.has('--browser');
const skipPortCleanup = flags.has('--no-stop');

function runSync(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function ensureFile(exampleRel, targetRel) {
  const example = path.join(root, exampleRel);
  const target = path.join(root, targetRel);
  if (!existsSync(target) && existsSync(example)) {
    copyFileSync(example, target);
    console.log(`created ${targetRel} from example`);
  }
}

if (!skipPortCleanup) {
  console.log('Freeing dev ports from a previous run (npm run dev:stop)…');
  spawnSync('npm', ['run', 'dev:stop'], { cwd: root, stdio: 'inherit', shell: true });
}

ensureFile('apps/api/.env.example', 'apps/api/.env');
ensureFile('apps/dashboard/.env.example', 'apps/dashboard/.env');
ensureFile('apps/local-agent/.env.example', 'apps/local-agent/.env');
ensureFile('apps/pos/.env.example', 'apps/pos/.env');
ensureFile('apps/kds/.env.example', 'apps/kds/.env');

if (!existsSync(path.join(root, 'node_modules/.prisma/client'))) {
  console.log('Prisma client missing — generating…');
  runSync('npm', ['run', 'db:generate']);
}

if (!existsSync(path.join(root, 'ops/secrets/jwt-private.pem'))) {
  console.log('JWT keys missing — generating…');
  runSync('npm', ['run', 'generate:jwt-keys']);
}

if (withDocker) {
  console.log('Starting Redis via Docker (Postgres: use apps/api/.env DATABASE_URL)…');
  runSync('docker', ['compose', 'up', '-d', 'redis']);
}

const jobs = [
  { command: 'npm run dev:api', name: 'api', prefixColor: 'blue' },
  { command: 'npm run dev:dashboard', name: 'dashboard', prefixColor: 'green' },
  {
    command: 'node scripts/wait-api-health.mjs && npm run dev:agent',
    name: 'agent',
    prefixColor: 'yellow',
  },
  browserOnly
    ? { command: 'npm run dev:pos', name: 'pos', prefixColor: 'magenta' }
    : {
        command: 'npm run electron:dev -w @venue-pos/pos',
        name: 'pos',
        prefixColor: 'magenta',
      },
];

if (withKds) {
  jobs.push({ command: 'npm run dev:kds', name: 'kds', prefixColor: 'cyan' });
}

console.log('\nVenue POS dev stack (run from repo root: npm run dev)');
console.log('  API        http://localhost:3000');
console.log('  Dashboard  http://localhost:5173');
console.log('  Agent      http://127.0.0.1:3456');
console.log(browserOnly ? '  POS        http://localhost:5174' : '  POS        Electron + http://localhost:5174');
if (withKds) console.log('  KDS        http://localhost:5175');
console.log('  Ctrl+C to stop all\n');

const { result } = concurrently(jobs, {
  cwd: root,
  env: devEnv,
  // Closing the Electron window stops POS only — keep API/dashboard/agent running.
  killOthersOn: { failure: ['api', 'dashboard', 'agent', ...(withKds ? ['kds'] : [])] },
});

await result;
