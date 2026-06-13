/**
 * Rebuild native modules for current Node version (bcrypt, better-sqlite3).
 */
import { spawnSync } from 'node:child_process';

const res = spawnSync('npm', ['rebuild', 'bcrypt', 'better-sqlite3'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (res.status !== 0) {
  console.error('Native rebuild failed.');
  console.error('Stop the agent first: pm2 stop venue-pos-agent');
  console.error('If the project is under OneDrive, pause sync or move to C:\\Venue_POS.');
  console.error('Ensure Node 20 LTS is installed.');
  process.exit(res.status ?? 1);
}

console.log('Native modules rebuilt OK.');
