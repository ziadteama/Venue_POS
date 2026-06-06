/**
 * Free dev stack ports after a crashed or duplicate npm run dev.
 * Windows: uses netstat + taskkill. Unix: uses lsof + kill.
 */
import { execSync } from 'node:child_process';

const PORTS = [3000, 3456, 5173, 5174, 5175];

function killWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`stopped PID ${pid} (port ${port})`);
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* no listener */
  }
}

function killUnix(port) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        console.log(`stopped PID ${pid} (port ${port})`);
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* no listener */
  }
}

const kill = process.platform === 'win32' ? killWindows : killUnix;

console.log('Freeing Venue POS dev ports…');
for (const port of PORTS) kill(port);
console.log('Done. Run: npm run dev');
