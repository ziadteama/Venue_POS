import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWatchdog } from '../src/watchdog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const crashChild = path.join(__dirname, 'fixtures', 'crash-child.mjs');

function tempLogFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-log-')), 'watchdog.log');
}

test('watchdog relaunches crashing child', async () => {
  const logFile = tempLogFile();
  const config = {
    enabled: true,
    checkIntervalMs: 200,
    maxRestarts: 10,
    restartWindowMs: 600_000,
    logFile,
    posCwd: process.cwd(),
    posCommand: `node "${crashChild}"`,
    repoRoot: process.cwd(),
  };

  const wd = createWatchdog(config);
  wd.start();

  await new Promise((r) => setTimeout(r, 1200));

  const log = fs.readFileSync(logFile, 'utf8');
  assert.match(log, /Watchdog started/);
  assert.match(log, /Starting POS/);
  assert.match(log, /POS exited/);
  assert.match(log, /Relaunching POS|Restart storm/);

  await wd.stop();
});

test('watchdog logs ALERT on restart storm', async () => {
  const logFile = tempLogFile();
  const config = {
    enabled: true,
    checkIntervalMs: 100,
    maxRestarts: 2,
    restartWindowMs: 600_000,
    logFile,
    posCwd: process.cwd(),
    posCommand: `node "${crashChild}"`,
    repoRoot: process.cwd(),
  };

  const wd = createWatchdog(config);
  wd.start();

  await new Promise((r) => setTimeout(r, 1500));

  const log = fs.readFileSync(logFile, 'utf8');
  assert.match(log, /ALERT.*Restart storm/);

  await wd.stop();
});
