/**
 * Rebuild native modules for current Node version (bcrypt, better-sqlite3).
 */
import { spawnSync } from 'node:child_process';

const res = spawnSync('npm', ['rebuild', 'bcrypt', 'better-sqlite3'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (res.status !== 0) {
  console.error('Native rebuild failed. Ensure Node 20 LTS is installed.');
  process.exit(res.status ?? 1);
}

console.log('Native modules rebuilt OK.');
