import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function envBool(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function envInt(key, fallback) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig() {
  const logFile = process.env.WATCHDOG_LOG_FILE || path.join(repoRoot, 'logs', 'watchdog.log');
  const posCwd = process.env.WATCHDOG_POS_CWD || repoRoot;
  const posCommand =
    process.env.WATCHDOG_POS_COMMAND ||
    'npm run electron:dev -w @venue-pos/pos';

  return {
    enabled: envBool('WATCHDOG_ENABLED', true),
    checkIntervalMs: envInt('WATCHDOG_CHECK_INTERVAL_MS', 5000),
    maxRestarts: envInt('WATCHDOG_MAX_RESTARTS', 3),
    restartWindowMs: envInt('WATCHDOG_RESTART_WINDOW_MS', 600_000),
    logFile,
    posCwd,
    posCommand,
    repoRoot,
  };
}
