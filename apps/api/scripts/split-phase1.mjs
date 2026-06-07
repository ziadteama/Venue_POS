import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(apiRoot, 'src/phase1.test.js');
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split(/\r?\n/);

const header = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixture.js';
import {
  fx,
  VENUE_ID,
  TERMINAL_ID,
  TERMINAL_SECRET,
  CASHIER_ID,
  terminalHeaders,
  prisma,
  ensureOpenShift,
  clearOpenCheques,
} from './fixture.js';

`;

const sections = [
  { name: 'auth-menu.js', start: 188, end: 416 },
  { name: 'cheques.js', start: 418, end: 1023 },
  { name: 'shifts.js', start: 1025, end: 1173 },
  { name: 'payments.js', start: 1175, end: 1638 },
  { name: 'dashboard.js', start: 1640, end: 2083 },
];

function transform(body) {
  return body
    .replace(/\bapp\./g, 'fx.app.')
    .replace(/\bmanagerToken\b/g, 'fx.managerToken')
    .replace(/\bownerToken\b/g, 'fx.ownerToken')
    .replace(/\bvenueManagerToken\b/g, 'fx.venueManagerToken')
    .replace(/\btemplateId\b/g, 'fx.templateId')
    .replace(/\bcategoryId\b/g, 'fx.categoryId')
    .replace(/\bmenuItemId\b/g, 'fx.menuItemId')
    .replace(/\borderId\b/g, 'fx.orderId')
    .replace(/fx\.menuItemId,/g, 'menuItemId: fx.menuItemId,');
}

const outDir = path.join(apiRoot, 'src/phase1');
for (const { name, start, end } of sections) {
  const body = lines.slice(start - 1, end).join('\n');
  fs.writeFileSync(path.join(outDir, name), header + transform(body) + '\n', 'utf8');
}

const entry = `/**
 * Phase 1 integration suite.
 * Tests live in ./phase1/*.js and share one DB fixture via ./phase1/fixture.js.
 * This file is the single entry point so the suite runs sequentially with shared state.
 */
import './phase1/fixture.js';
import './phase1/auth-menu.js';
import './phase1/cheques.js';
import './phase1/shifts.js';
import './phase1/payments.js';
import './phase1/dashboard.js';
`;

fs.writeFileSync(srcPath, entry, 'utf8');
console.log(`Wrote ${sections.length} modules to ${outDir} and updated ${srcPath}`);
