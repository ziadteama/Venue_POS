/**
 * Block until the API health endpoint responds (dev stack startup ordering).
 */
const healthUrl = process.env.API_HEALTH_URL ?? 'http://127.0.0.1:3000/health';
const timeoutMs = Number(process.env.API_WAIT_TIMEOUT_MS ?? 90_000);
const intervalMs = 500;
const started = Date.now();

async function ready() {
  const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
  return res.ok;
}

console.log(`Waiting for API at ${healthUrl}…`);

while (Date.now() - started < timeoutMs) {
  try {
    if (await ready()) {
      console.log('API is up.');
      process.exit(0);
    }
  } catch {
    /* retry */
  }
  await new Promise((r) => setTimeout(r, intervalMs));
}

console.error(`API did not become ready within ${timeoutMs / 1000}s (${healthUrl})`);
console.error('Check apps/api/.env DATABASE_URL and that Postgres is running.');
process.exit(1);
