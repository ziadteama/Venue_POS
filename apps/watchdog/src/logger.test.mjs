import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLogger } from './logger.mjs';

test('createLogger appends lines to file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-logger-'));
  const logFile = path.join(dir, 'nested', 'watchdog.log');
  const log = createLogger(logFile);
  log.info('started');
  log.alert('storm');
  const content = fs.readFileSync(logFile, 'utf8');
  assert.match(content, /\[INFO\] started/);
  assert.match(content, /\[ALERT\] storm/);
});
