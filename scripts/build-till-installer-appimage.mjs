#!/usr/bin/env node
/**
 * Build Venue POS Till Installer AppImage (full till stack + setup entrypoint).
 * Linux only. Output: dist/VenuePOS-Till-Installer-{version}-x86_64.AppImage
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version =
  process.env.BUNDLE_VERSION ??
  JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
const bundleDir = path.join(repoRoot, 'dist', `venue-pos-till-${version}`);
const appDir = path.join(repoRoot, 'dist', 'AppDir');
const installerName = `VenuePOS-Till-Installer-${version}-x86_64.AppImage`;
const installerOut = path.join(repoRoot, 'dist', installerName);
const appimagetoolCache = path.join(repoRoot, 'dist', 'appimagetool-x86_64.AppImage');
const appimagetoolUrl =
  'https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage';
const installerShellDir = path.join(repoRoot, 'ops', 'linux', 'installer-appimage');
const debugLogPath = path.join(repoRoot, 'debug-757386.log');

// 1x1 PNG placeholder (appimagetool requires a valid PNG for .DirIcon)
const ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function agentLog(location, message, data = {}, hypothesisId = 'A') {
  const payload = {
    sessionId: '757386',
    runId: process.env.GITHUB_RUN_ID ?? 'local',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  // #region agent log
  try {
    fs.appendFileSync(debugLogPath, `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }
  fetch('http://127.0.0.1:7309/ingest/326a5a87-1402-4a58-9998-b3a74398ca1e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '757386' },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

function distFreeMb() {
  const res = spawnSync('df', ['-m', path.join(repoRoot, 'dist')], { encoding: 'utf8' });
  if (res.status !== 0) return null;
  const line = res.stdout.trim().split('\n').pop();
  const parts = line?.split(/\s+/);
  return parts?.length >= 4 ? Number(parts[3]) : null;
}

function run(cmd, args, opts = {}) {
  agentLog('build-till-installer-appimage.mjs:run', 'spawn', { cmd, argCount: args.length }, 'A');
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, shell: false, ...opts });
  if (res.error) {
    agentLog(
      'build-till-installer-appimage.mjs:run',
      'spawn-error',
      { cmd, error: res.error.message },
      'A',
    );
    console.error(`Failed to run ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    agentLog(
      'build-till-installer-appimage.mjs:run',
      'non-zero-exit',
      { cmd, status: res.status },
      'A',
    );
    process.exit(res.status ?? 1);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function findInnerAppImage() {
  const releaseDir = path.join(bundleDir, 'pos', 'release');
  if (!fs.existsSync(releaseDir)) return null;
  return fs.readdirSync(releaseDir).find((n) => n.endsWith('.AppImage')) ?? null;
}

if (process.platform !== 'linux') {
  console.error('Till Installer AppImage must be built on Linux (use GitHub Actions or Ubuntu).');
  process.exit(1);
}

console.log('Step 1/4: Building till bundle...');
agentLog(
  'build-till-installer-appimage.mjs:step1',
  'start',
  { distFreeMb: distFreeMb() },
  'B',
);
run('node', [path.join(repoRoot, 'scripts', 'build-till-bundle.mjs')], {
  env: { ...process.env, BUILD_POS_APPIMAGE: '1' },
});
agentLog(
  'build-till-installer-appimage.mjs:step1',
  'done',
  { bundleExists: fs.existsSync(bundleDir), distFreeMb: distFreeMb() },
  'B',
);

if (!fs.existsSync(bundleDir)) {
  agentLog('build-till-installer-appimage.mjs:step1', 'bundle-missing', { bundleDir }, 'C');
  console.error(`Bundle folder missing: ${bundleDir}`);
  process.exit(1);
}

const innerAppImage = findInnerAppImage();
if (!innerAppImage) {
  agentLog('build-till-installer-appimage.mjs:step1', 'inner-appimage-missing', { bundleDir }, 'C');
  console.error('Inner POS AppImage missing — build till bundle on Linux with BUILD_POS_APPIMAGE=1');
  process.exit(1);
}
agentLog(
  'build-till-installer-appimage.mjs:step1',
  'inner-appimage-found',
  { innerAppImage },
  'B',
);

console.log('Step 2/4: Assembling AppDir...');
agentLog('build-till-installer-appimage.mjs:step2', 'start', { distFreeMb: distFreeMb() }, 'D');
if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });

for (const name of fs.readdirSync(bundleDir)) {
  copyDir(path.join(bundleDir, name), path.join(appDir, name));
}

for (const name of ['AppRun', 'venue-pos-installer.desktop']) {
  const src = path.join(installerShellDir, name);
  const dest = path.join(appDir, name);
  fs.copyFileSync(src, dest);
  if (name === 'AppRun') fs.chmodSync(dest, 0o755);
}

fs.writeFileSync(path.join(appDir, 'icon.png'), ICON_PNG);
fs.writeFileSync(path.join(appDir, '.DirIcon'), ICON_PNG);
fs.writeFileSync(path.join(appDir, 'venue-pos-installer.png'), ICON_PNG);
fs.writeFileSync(path.join(appDir, 'VERSION'), `${version}\n`);
agentLog('build-till-installer-appimage.mjs:step2', 'done', { distFreeMb: distFreeMb() }, 'D');

console.log('Step 3/4: Fetching appimagetool...');
if (!fs.existsSync(appimagetoolCache)) {
  run('curl', ['-fsSL', '-o', appimagetoolCache, appimagetoolUrl]);
  fs.chmodSync(appimagetoolCache, 0o755);
}

console.log('Step 4/4: Running appimagetool...');
if (fs.existsSync(installerOut)) fs.rmSync(installerOut, { force: true });
agentLog(
  'build-till-installer-appimage.mjs:step4',
  'start',
  { extractAndRun: true, distFreeMb: distFreeMb() },
  'A',
);
// GHA runners block FUSE mounts — appimagetool is itself an AppImage.
run(
  appimagetoolCache,
  ['--appimage-extract-and-run', '--no-appstream', appDir, installerOut],
  { env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' } },
);
agentLog(
  'build-till-installer-appimage.mjs:step4',
  'done',
  { installerExists: fs.existsSync(installerOut), distFreeMb: distFreeMb() },
  'A',
);

const innerSize = fs.statSync(path.join(bundleDir, 'pos', 'release', innerAppImage)).size;
const outerSize = fs.statSync(installerOut).size;
if (outerSize < innerSize) {
  console.error(`Sanity check failed: installer (${outerSize}) smaller than inner POS AppImage (${innerSize})`);
  process.exit(1);
}

console.log(`\nTill Installer AppImage ready:`);
console.log(`  ${installerOut}`);
console.log(`  Size: ${(outerSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`\nOn till:`);
console.log(`  chmod +x ${installerName}`);
console.log(`  ./${installerName}`);
console.log(`  # or: sudo ./${installerName} --no-gui`);
