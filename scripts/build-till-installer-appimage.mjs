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

// 1x1 PNG placeholder (appimagetool requires a valid PNG for .DirIcon)
const ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, shell: false, ...opts });
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
run('node', [path.join(repoRoot, 'scripts', 'build-till-bundle.mjs')], {
  env: { ...process.env, BUILD_POS_APPIMAGE: '1' },
});

if (!fs.existsSync(bundleDir)) {
  console.error(`Bundle folder missing: ${bundleDir}`);
  process.exit(1);
}

const innerAppImage = findInnerAppImage();
if (!innerAppImage) {
  console.error('Inner POS AppImage missing — build till bundle on Linux with BUILD_POS_APPIMAGE=1');
  process.exit(1);
}

console.log('Step 2/4: Assembling AppDir...');
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

console.log('Step 3/4: Fetching appimagetool...');
if (!fs.existsSync(appimagetoolCache)) {
  run('curl', ['-fsSL', '-o', appimagetoolCache, appimagetoolUrl]);
  fs.chmodSync(appimagetoolCache, 0o755);
}

console.log('Step 4/4: Running appimagetool...');
if (fs.existsSync(installerOut)) fs.rmSync(installerOut, { force: true });
run(appimagetoolCache, ['--no-appstream', appDir, installerOut]);

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
