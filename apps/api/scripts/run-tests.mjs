/**
 * Cross-platform API test runner (CI-safe).
 * `node --test src` would also execute index.js and hang; globs are not expanded on Linux npm.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} dir @returns {string[]} */
function collectTestFiles(dir) {
  const files = [];
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

/** @param {string} file @param {string} pattern */
function matchesPattern(file, pattern) {
  const normalizedFile = file.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');
  if (normalizedPattern.includes('*')) {
    const re = new RegExp(
      `^${normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`,
    );
    return re.test(normalizedFile);
  }
  return (
    normalizedFile === normalizedPattern ||
    normalizedFile.endsWith(`/${normalizedPattern}`) ||
    normalizedFile.endsWith(normalizedPattern)
  );
}

const allTestFiles = collectTestFiles(path.join(apiRoot, 'src')).sort();
const cliFilters = process.argv.slice(2).map((arg) => arg.replace(/\\/g, '/'));
const testFiles = cliFilters.length
  ? allTestFiles.filter((file) => cliFilters.some((pattern) => matchesPattern(file, pattern)))
  : allTestFiles;

if (cliFilters.length && !testFiles.length) {
  console.error(`No API test files matched: ${cliFilters.join(', ')}`);
  process.exit(1);
}
if (!testFiles.length) {
  console.error('No *.test.js files found under apps/api/src');
  process.exit(1);
}

if (cliFilters.length) {
  console.log(`Running ${testFiles.length} API test file(s) matching: ${cliFilters.join(', ')}`);
}

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...testFiles], {
  cwd: apiRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    FEATURE_MANUAL_CARD_PAYMENT: process.env.FEATURE_MANUAL_CARD_PAYMENT ?? 'true',
    FEATURE_LINE_TRANSFER: process.env.FEATURE_LINE_TRANSFER ?? 'true',
    FEATURE_CROSS_VENUE_BILLING: process.env.FEATURE_CROSS_VENUE_BILLING ?? 'true',
    FEATURE_KDS_ENABLED: process.env.FEATURE_KDS_ENABLED ?? 'true',
  },
});

process.exit(result.status ?? 1);
