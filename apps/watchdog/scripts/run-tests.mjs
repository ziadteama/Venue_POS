/**
 * Watchdog test runner — explicit file list (globs unreliable on Windows + Linux CI).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} dir @returns {string[]} */
function collectTestFiles(dir) {
  const files = [];
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (name.endsWith('.test.mjs')) {
      files.push(full);
    }
  }
  return files;
}

const testFiles = [path.join(root, 'src'), path.join(root, 'test')]
  .flatMap(collectTestFiles)
  .sort();

if (!testFiles.length) {
  console.error('No *.test.mjs files found under apps/watchdog');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  cwd: root,
});

process.exit(result.status ?? 1);
