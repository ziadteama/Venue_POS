#!/usr/bin/env node
/**
 * Refresh venue-pos-local-agent/ from monorepo sources.
 * Run from repo root: node scripts/sync-standalone-local-agent.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(repoRoot, 'venue-pos-local-agent');

function rmSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function cpDir(src, dest, { skip = () => false } = {}) {
  if (!fs.existsSync(src)) throw new Error(`Missing source: ${src}`);
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(name.name, path.join(src, name.name))) continue;
    const from = path.join(src, name.name);
    const to = path.join(dest, name.name);
    if (name.isDirectory()) cpDir(from, to, { skip });
    else fs.copyFileSync(from, to);
  }
}

function skipTests(name, fullPath) {
  if (name.endsWith('.test.js')) return true;
  if (name === 'test') return true;
  return false;
}

console.log('Syncing standalone local-agent →', outRoot);

rmSafe(path.join(outRoot, 'src'));
rmSafe(path.join(outRoot, 'packages', 'shared'));

cpDir(path.join(repoRoot, 'apps/local-agent/src'), path.join(outRoot, 'src'), { skip: skipTests });
cpDir(path.join(repoRoot, 'packages/shared'), path.join(outRoot, 'packages/shared'));

const purgeSrc = path.join(repoRoot, 'apps/local-agent/scripts/purge-local-cache.mjs');
const purgeDest = path.join(outRoot, 'scripts/purge-local-cache.mjs');
fs.mkdirSync(path.dirname(purgeDest), { recursive: true });
fs.copyFileSync(purgeSrc, purgeDest);

console.log('Done. Review venue-pos-local-agent/ and commit or push to standalone repo.');
