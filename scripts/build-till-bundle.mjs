#!/usr/bin/env node
/**
 * Build Linux x64 till USB bundle (POS + local-agent + ops/linux).
 * Uses Docker node:20 when available for native module builds; falls back to local npm.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.env.BUNDLE_VERSION ?? JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
).version;
const outDir = path.join(repoRoot, 'dist', `venue-pos-till-${version}`);
const archive = path.join(repoRoot, 'dist', `venue-pos-till-${version}.tar.gz`);

function resolveCmd(cmd) {
  if (process.platform === 'win32' && !cmd.endsWith('.cmd') && !path.isAbsolute(cmd)) {
    return `${cmd}.cmd`;
  }
  return cmd;
}

function run(cmd, args, opts = {}) {
  const resolved = resolveCmd(cmd);
  const res = spawnSync(resolved, args, {
    stdio: 'inherit',
    cwd: repoRoot,
    ...opts,
  });
  if (res.error) {
    console.error(`Failed to run ${resolved}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function pruneBundle() {
  const drop = (p) => {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  };
  drop(path.join(outDir, 'local-agent', 'data'));
  drop(path.join(outDir, 'local-agent', '.env'));
  drop(path.join(outDir, 'pos', '.env'));
  for (const sub of ['local-agent', 'pos']) {
    const nm = path.join(outDir, sub, 'node_modules');
    if (!fs.existsSync(nm)) continue;
    for (const name of fs.readdirSync(nm)) {
      if (name.startsWith('.cache')) drop(path.join(nm, name));
    }
  }
}

if (process.env.SKIP_BUNDLE_CI === '1') {
  console.log('Skipping npm ci (SKIP_BUNDLE_CI=1)...');
} else {
  console.log('Installing workspace dependencies (npm ci — may take a few minutes)...');
  run('npm', ['ci', '--include-workspace-root']);
}

console.log('Building POS (vite)...');
run('npm', ['run', 'build', '-w', '@venue-pos/pos']);

console.log('Assembling bundle...');
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

copyDir(path.join(repoRoot, 'apps', 'local-agent'), path.join(outDir, 'local-agent'));
copyDir(path.join(repoRoot, 'apps', 'pos'), path.join(outDir, 'pos'));
copyDir(path.join(repoRoot, 'ops'), path.join(outDir, 'ops'));
copyDir(path.join(repoRoot, 'packages'), path.join(outDir, 'packages'));
copyDir(path.join(repoRoot, 'node_modules'), path.join(outDir, 'node_modules'));

// Shared workspace link for agent
if (!fs.existsSync(path.join(outDir, 'local-agent', 'node_modules', '@venue-pos'))) {
  fs.mkdirSync(path.join(outDir, 'local-agent', 'node_modules', '@venue-pos'), { recursive: true });
}

pruneBundle();

console.log('Creating archive...');
fs.mkdirSync(path.dirname(archive), { recursive: true });
if (process.platform === 'win32') {
  run('tar', ['-czf', archive, '-C', path.dirname(outDir), path.basename(outDir)]);
} else {
  run('tar', ['-czf', archive, '-C', path.dirname(outDir), path.basename(outDir)]);
}

console.log(`\nBundle ready: ${archive}`);
console.log('Copy to USB → on till: sudo bash ops/linux/install.sh');
