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

function run(cmd, args, opts = {}) {
  // Windows (incl. Git Bash): shell:true — spawnSync('npm.cmd', …) without shell → EINVAL
  const useShell = process.platform === 'win32';
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: repoRoot,
    shell: useShell,
    ...opts,
  });
  if (res.error) {
    console.error(`Failed to run ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

const skipNodeModules = process.env.SKIP_BUNDLE_NODE_MODULES === '1';

function stripNodeModules(dir) {
  const nm = path.join(dir, 'node_modules');
  if (fs.existsSync(nm)) fs.rmSync(nm, { recursive: true, force: true });
}

function pruneBundle() {
  const drop = (p) => {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  };
  drop(path.join(outDir, 'local-agent', 'data'));
  drop(path.join(outDir, 'local-agent', '.env'));
  drop(path.join(outDir, 'pos', '.env'));
  if (skipNodeModules) {
    drop(path.join(outDir, 'node_modules'));
    for (const sub of ['local-agent', 'pos', 'watchdog']) {
      stripNodeModules(path.join(outDir, sub));
    }
    for (const pkg of fs.existsSync(path.join(outDir, 'packages'))
      ? fs.readdirSync(path.join(outDir, 'packages'))
      : []) {
      stripNodeModules(path.join(outDir, 'packages', pkg));
    }
    return;
  }
  for (const sub of ['local-agent', 'pos']) {
    const nm = path.join(outDir, sub, 'node_modules');
    if (!fs.existsSync(nm)) continue;
    for (const name of fs.readdirSync(nm)) {
      if (name.startsWith('.cache')) drop(path.join(nm, name));
    }
  }
}

function writeTillPackageJson() {
  const tillPkg = {
    name: 'venue-pos-till',
    version,
    private: true,
    workspaces: ['local-agent', 'pos', 'packages/*'],
  };
  fs.writeFileSync(
    path.join(outDir, 'package.json'),
    `${JSON.stringify(tillPkg, null, 2)}\n`,
  );
}

const nodeMajor = Number(process.versions.node.split('.')[0]);

if (process.env.SKIP_BUNDLE_CI === '1') {
  console.log('Skipping npm ci (SKIP_BUNDLE_CI=1)...');
} else {
  console.log('Installing workspace dependencies (npm ci — may take a few minutes)...');
  if (process.platform === 'win32') {
    // Linux till bundle — install.sh rebuilds bcrypt/better-sqlite3 on Ubuntu.
    // Avoids Node 24 / MSVC native compile failures on Windows dev machines.
    console.log(
      'Windows: using --ignore-scripts (native modules are rebuilt on the till by ops/linux/install.sh).',
    );
    run('npm', ['ci', '--include-workspace-root', '--ignore-scripts']);
  } else if (nodeMajor !== 20) {
    console.warn(
      `Warning: Node ${process.version} — repo targets Node 20. Prefer: nvm use 20 && npm ci`,
    );
    run('npm', ['ci', '--include-workspace-root']);
  } else {
    run('npm', ['ci', '--include-workspace-root']);
  }
}

console.log('Building POS (vite)...');
const posDir = path.join(repoRoot, 'apps', 'pos');
const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
if (fs.existsSync(viteBin)) {
  run('node', [viteBin, 'build'], { cwd: posDir });
} else {
  run('npm', ['run', 'build', '-w', '@venue-pos/pos']);
}

if (process.platform === 'linux' || process.env.BUILD_POS_APPIMAGE === '1') {
  console.log('Packaging POS AppImage (electron-updater)...');
  run('npm', ['run', 'build:packaged', '-w', '@venue-pos/pos']);
} else {
  console.log(
    'Skipping AppImage (run on Linux or set BUILD_POS_APPIMAGE=1 for packaged auto-update builds).',
  );
}

console.log('Assembling bundle...');
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

copyDir(path.join(repoRoot, 'apps', 'local-agent'), path.join(outDir, 'local-agent'));
copyDir(path.join(repoRoot, 'apps', 'pos'), path.join(outDir, 'pos'));
if (fs.existsSync(path.join(repoRoot, 'apps', 'watchdog'))) {
  copyDir(path.join(repoRoot, 'apps', 'watchdog'), path.join(outDir, 'watchdog'));
}
copyDir(path.join(repoRoot, 'ops'), path.join(outDir, 'ops'));
copyDir(path.join(repoRoot, 'packages'), path.join(outDir, 'packages'));
if (!skipNodeModules) {
  copyDir(path.join(repoRoot, 'node_modules'), path.join(outDir, 'node_modules'));
}
if (fs.existsSync(path.join(repoRoot, 'setup.sh'))) {
  fs.copyFileSync(path.join(repoRoot, 'setup.sh'), path.join(outDir, 'setup.sh'));
  fs.chmodSync(path.join(outDir, 'setup.sh'), 0o755);
}
if (skipNodeModules) {
  writeTillPackageJson();
  console.log('Slim bundle: node_modules omitted — on till run: cd /opt/venue-pos && npm i');
} else if (fs.existsSync(path.join(repoRoot, 'package.json'))) {
  fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(outDir, 'package.json'));
}

if (!skipNodeModules) {
  // Shared workspace link for agent
  if (!fs.existsSync(path.join(outDir, 'local-agent', 'node_modules', '@venue-pos'))) {
    fs.mkdirSync(path.join(outDir, 'local-agent', 'node_modules', '@venue-pos'), { recursive: true });
  }
}

pruneBundle();

console.log(`\nBundle folder ready: ${outDir}`);
if (skipNodeModules) {
  console.log('Copy to USB → on till: sudo bash setup.sh → cd /opt/venue-pos && npm i → reboot');
} else {
  console.log('Copy to USB → on till: sudo bash setup.sh');
}

if (process.env.SKIP_BUNDLE_ZIP === '1') {
  console.log('Skipping archive (SKIP_BUNDLE_ZIP=1).');
  process.exit(0);
}

console.log('Creating archive...');
fs.mkdirSync(path.dirname(archive), { recursive: true });
// GNU tar on Windows/Git Bash treats `Z:\path` as remote host `Z` — use relative paths only.
const bundleDirName = path.basename(outDir);
const archiveArg = path.join('dist', `${bundleDirName}.tar.gz`).split(path.sep).join('/');
run('tar', ['-czf', archiveArg, '-C', 'dist', bundleDirName]);

console.log(`Archive ready: ${archive}`);
