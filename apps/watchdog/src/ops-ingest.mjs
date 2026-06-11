/**
 * @param {ReturnType<typeof import('./config.mjs').loadConfig>} config
 * @param {{ count: number; windowMs: number; maxRestarts: number }} details
 */
export async function postRestartStormAlert(config, details) {
  if (!config.opsIngestUrl || !config.opsIngestSecret) return;

  try {
    const res = await fetch(config.opsIngestUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ops-ingest-secret': config.opsIngestSecret,
      },
      body: JSON.stringify({
        type: 'watchdog_restart_storm',
        severity: 'critical',
        source: 'watchdog',
        title: 'POS restart storm',
        message: `POS restarted ${details.count} times within ${Math.round(details.windowMs / 60000)} minutes`,
        details,
      }),
    });
    if (!res.ok) {
      console.warn(`[watchdog] ops ingest failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[watchdog] ops ingest error: ${err.message}`);
  }
}
