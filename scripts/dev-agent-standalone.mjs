/**
 * Dev entry for venue-pos-local-agent/ (standalone microservice copy).
 * Used by: npm run dev:agent:standalone  and  npm run dev -- --standalone-agent
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureNode20Process, node20PathEnv, resolveNode20Exe } from './node20.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selfPath = fileURLToPath(import.meta.url);
const agentRoot = path.join(root, 'venue-pos-local-agent');

const { ok } = ensureNode20Process(selfPath, process.argv.slice(2), root);
if (!ok) {
  console.error(`Node ${process.version} detected; Node 20 required.`);
  console.error('Install: nvm install 20   then: npm run setup:node20');
  process.exit(1);
}

function ensureStandaloneEnv() {
  const target = path.join(agentRoot, '.env');
  if (existsSync(target)) return;
  const fromMonorepo = path.join(root, 'apps/local-agent/.env');
  const fromExample = path.join(agentRoot, '.env.example');
  if (existsSync(fromMonorepo)) {
    copyFileSync(fromMonorepo, target);
    console.log('[standalone-agent] copied apps/local-agent/.env → venue-pos-local-agent/.env');
  } else if (existsSync(fromExample)) {
    copyFileSync(fromExample, target);
    console.log('[standalone-agent] created venue-pos-local-agent/.env from .env.example');
  }
}

function ensureDeps() {
  if (existsSync(path.join(agentRoot, 'node_modules', 'better-sqlite3'))) return;
  console.log('[standalone-agent] npm install in venue-pos-local-agent/ (first run)…');
  const result = spawnSync('npm', ['install'], {
    cwd: agentRoot,
    stdio: 'inherit',
    shell: true,
    env: node20PathEnv(),
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

ensureStandaloneEnv();
ensureDeps();

const node20 = resolveNode20Exe();
if (!node20) {
  console.error('Node 20 not found.');
  process.exit(1);
}

console.log('[standalone-agent] venue-pos-local-agent on http://127.0.0.1:3456');
console.log('[standalone-agent] (not apps/local-agent)');

const env = {
  ...node20PathEnv(),
  VENUE_POS_AGENT_ROOT: agentRoot,
  VENUE_POS_INSTALL_ROOT: agentRoot,
};

const child = spawn(
  node20,
  ['--watch-path=./src', '--watch', 'src/index.js'],
  { cwd: agentRoot, stdio: 'inherit', env, shell: false },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
