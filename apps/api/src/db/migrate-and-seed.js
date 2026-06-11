/**
 * Production startup: retry migrate deploy until DB is reachable, then seed.
 * Handles the race condition where Render starts the web service before
 * the managed Postgres instance finishes provisioning.
 */
import { execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const MAX_ATTEMPTS = 15;
const RETRY_DELAY_MS = 5000;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    console.log(`[migrate] attempt ${attempt}/${MAX_ATTEMPTS}...`);
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('[migrate] migrations applied.');
    break;
  } catch {
    if (attempt >= MAX_ATTEMPTS) {
      console.error('[migrate] DB unreachable after all retries. Exiting.');
      process.exit(1);
    }
    console.log(`[migrate] DB not ready, retrying in ${RETRY_DELAY_MS / 1000}s...`);
    await sleep(RETRY_DELAY_MS);
  }
}

// Prod seed — upserts only, safe to re-run on every deploy
execSync('node src/db/seed-prod.js', { stdio: 'inherit' });
