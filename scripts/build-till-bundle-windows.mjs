#!/usr/bin/env node
/**
 * Build Windows till bundle (POS + local-agent + watchdog + ops/windows).
 * Output: dist/venue-pos-till-windows-{version}/ and .zip for USB deploy.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureNode20Process, node20PathEnv, resolveNode20Exe } from './node20.mjs';

const selfPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(selfPath), '..');

if (Number(process.versions.node.split('.')[0]) !== 20) {
  ensureNode20Process(selfPath, process.argv.slice(2), repoRoot);
}
const version =
  process.env.BUNDLE_VERSION ??
  JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
const bundleName = `venue-pos-till-windows-${version}`;
const outDir = path.join(repoRoot, 'dist', bundleName);
const archive = `${outDir}.zip`;

function runNpm(args) {
  const node20 = resolveNode20Exe();
  if (!node20) {
    console.error('Node 20 is required. Install via nvm: nvm install 20');
    process.exit(1);
  }
  const npmCli = path.join(path.dirname(node20), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const res = spawnSync(node20, [npmCli, ...args], {
    stdio: 'inherit',
    cwd: repoRoot,
    env: node20PathEnv(),
  });
  if (res.error) {
    console.error(`Failed to run npm: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function run(cmd, args, opts = {}) {
  const useShell = process.platform === 'win32';
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: repoRoot,
    shell: useShell,
    env: node20PathEnv(),
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

function removeDirSafe(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (err) {
    if (process.platform === 'win32' && (err.code === 'EBUSY' || err.code === 'EPERM')) {
      const stale = `${dir}.stale-${Date.now()}`;
      fs.renameSync(dir, stale);
      console.warn(`Bundle dir locked — moved aside to ${path.basename(stale)}`);
      return;
    }
    throw err;
  }
}

function pruneBundle() {
  const drop = (p) => {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  };
  drop(path.join(outDir, 'local-agent', 'data'));
  drop(path.join(outDir, 'local-agent', '.env'));
  drop(path.join(outDir, 'pos', '.env'));
  const releaseDir = path.join(outDir, 'pos', 'release');
  if (fs.existsSync(releaseDir)) {
    for (const name of fs.readdirSync(releaseDir)) {
      if (name.endsWith('-portable.exe')) continue;
      drop(path.join(releaseDir, name));
    }
  }
  for (const sub of ['local-agent', 'pos']) {
    const nm = path.join(outDir, sub, 'node_modules');
    if (!fs.existsSync(nm)) continue;
    for (const name of fs.readdirSync(nm)) {
      if (name.startsWith('.cache')) drop(path.join(nm, name));
    }
  }
}

if (process.platform !== 'win32') {
  console.warn('Warning: building Windows till bundle on non-Windows host (for USB copy to Windows tills).');
}

if (process.env.SKIP_BUNDLE_CI === '1') {
  console.log('Skipping npm ci (SKIP_BUNDLE_CI=1)...');
} else {
  console.log('Installing workspace dependencies (npm ci, Node 20)...');
  runNpm(['ci', '--include-workspace-root']);
  console.log('Rebuilding native modules for Node 20...');
  runNpm(['run', 'setup:node20']);
}

console.log('Building POS (vite production)...');
runNpm(['run', 'build', '-w', '@venue-pos/pos']);

console.log('Packaging POS portable .exe (electron-builder)...');
runNpm(['run', 'build:packaged:win', '-w', '@venue-pos/pos']);

const posRelease = path.join(repoRoot, 'apps', 'pos', 'release');
const portableExe = fs
  .readdirSync(posRelease)
  .filter((name) => name.endsWith('-portable.exe'))
  .sort()
  .at(-1);
if (!portableExe) {
  console.error(`No portable exe found in ${posRelease}`);
  process.exit(1);
}
console.log(`  Portable exe: ${portableExe}`);

console.log('Assembling Windows bundle...');
removeDirSafe(outDir);
fs.mkdirSync(outDir, { recursive: true });

copyDir(path.join(repoRoot, 'apps', 'local-agent'), path.join(outDir, 'local-agent'));
copyDir(path.join(repoRoot, 'apps', 'pos'), path.join(outDir, 'pos'));
copyDir(path.join(repoRoot, 'apps', 'watchdog'), path.join(outDir, 'watchdog'));
copyDir(path.join(repoRoot, 'ops'), path.join(outDir, 'ops'));
copyDir(path.join(repoRoot, 'deployment'), path.join(outDir, 'deployment'));
copyDir(path.join(repoRoot, 'packages'), path.join(outDir, 'packages'));
copyDir(path.join(repoRoot, 'node_modules'), path.join(outDir, 'node_modules'));
copyDir(path.join(repoRoot, 'scripts'), path.join(outDir, 'scripts'));

const rootPkg = {
  name: 'venue-pos-till-windows',
  version,
  private: true,
  workspaces: ['pos', 'local-agent', 'watchdog', 'packages/*'],
};
fs.writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`);

pruneBundle();

if (process.env.SKIP_BUNDLE_ZIP === '1') {
  console.log('Skipping zip (SKIP_BUNDLE_ZIP=1) — copy the bundle folder to USB.');
} else {
  console.log('Creating zip archive...');
  removeDirSafe(archive);
  if (process.platform === 'win32') {
    run('tar', ['-a', '-cf', path.join('dist', `${bundleName}.zip`).split(path.sep).join('/'), '-C', 'dist', bundleName]);
  } else {
    const relZip = path.join('dist', `${bundleName}.zip`).split(path.sep).join('/');
    run('tar', ['-a', '-cf', relZip, '-C', 'dist', bundleName]);
  }
}

console.log(`\nWindows till bundle ready:`);
console.log(`  Folder: ${outDir}`);
console.log(`  Zip:    ${archive}`);
console.log('\nOn till (Node 20 + NSSM — double-click deployment\\install-all.bat as Admin):');
console.log('  Expand-Archive .\\venue-pos-till-windows-*.zip -DestinationPath C:\\Venue_POS');
console.log('  copy deployment\\provision.env.example deployment\\provision.env  (edit creds)');
console.log('  deployment\\install-all.bat');
console.log('  # Reboot — VenuePosAgent (background) + launch-till.cmd (portable POS)');
console.log(`\nPOS portable exe: pos\\release\\${portableExe}`);
