import { scanAndEmitOpsAlerts } from '../services/ops-alert-service.js';

export const OPS_SCAN_INTERVAL_MS = 30_000;

export function startOpsMonitor(app) {
  let timer;

  async function tick() {
    if (!app.io) return;
    try {
      await scanAndEmitOpsAlerts(app.io);
    } catch (err) {
      app.log.warn({ err }, 'ops health scan failed');
    }
  }

  tick();
  timer = setInterval(tick, OPS_SCAN_INTERVAL_MS);

  return () => {
    if (timer) clearInterval(timer);
  };
}
