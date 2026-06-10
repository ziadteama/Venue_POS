/**
 * Local-agent test runner — always uses Node 20 (better-sqlite3 native module).
 * Shell globs are unreliable on Windows; collect *.test.js explicitly.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNode20Exe, node20PathEnv } from '../../../scripts/node20.mjs';

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} dir @returns {string[]} */
function collectTestFiles(dir) {
  const files = [];
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (name.endsWith('.test.js')) {
      files.push(full);
    }
  }
  return files;
}

const roots = [
  path.join(agentRoot, 'src', 'services'),
  path.join(agentRoot, 'src', 'db'),
  path.join(agentRoot, 'test', 'e2e'),
];

const testFiles = roots.flatMap(collectTestFiles).sort();
if (!testFiles.length) {
  console.error('No *.test.js files found under local-agent');
  process.exit(1);
}

const node20 = resolveNode20Exe();
if (!node20) {
  console.error(`Node ${process.version} is active; Node 20 is required for local-agent tests.`);
  console.error('Install NVM Node 20, then run: npm run setup:node20');
  process.exit(1);
}

if (process.execPath !== node20) {
  console.log(`Using Node 20 (${node20}) — shell has ${process.version}`);
}

const result = spawnSync(node20, ['--test', ...testFiles], {
  cwd: agentRoot,
  stdio: 'inherit',
  env: node20PathEnv(),
});

process.exit(result.status ?? 1);
