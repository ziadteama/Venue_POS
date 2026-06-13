/**
 * Poll GET /health until OK or timeout.
 * Usage: node scripts/health-check.mjs [url]
 */
const url = process.argv[2] ?? 'http://127.0.0.1:3456/health';
const maxAttempts = 30;

for (let i = 1; i <= maxAttempts; i++) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const body = await res.text();
      console.log(`OK (${i}): ${body}`);
      process.exit(0);
    }
  } catch {
    // retry
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.error(`FAIL: ${url} not reachable after ${maxAttempts}s`);
process.exit(1);
