import { spawn } from 'node:child_process';
import { createRestartTracker } from './restart-policy.mjs';
import { createLogger } from './logger.mjs';
import { loadConfig } from './config.mjs';

/** @typedef {import('node:child_process').ChildProcess} ChildProcess */

/**
 * @param {ReturnType<typeof loadConfig>} config
 */
export function createWatchdog(config) {
  const log = createLogger(config.logFile);
  const tracker = createRestartTracker(config.maxRestarts, config.restartWindowMs);

  /** @type {ChildProcess | null} */
  let child = null;
  let stopping = false;

  function isChildRunning() {
    if (!child) return false;
    if (child.exitCode !== null) return false;
    if (child.signalCode !== null) return false;
    return true;
  }

  function spawnPos() {
    if (stopping) return;
    log.info(`Starting POS: ${config.posCommand} (cwd=${config.posCwd})`);
    child = spawn(config.posCommand, {
      shell: true,
      cwd: config.posCwd,
      env: { ...process.env, ELECTRON_IS_KIOSK: process.env.ELECTRON_IS_KIOSK ?? 'true' },
      stdio: 'inherit',
      windowsHide: false,
    });
    child.on('exit', (code, signal) => {
      log.info(`POS exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      child = null;
    });
    child.on('error', (err) => {
      log.warn(`POS spawn error: ${err.message}`);
      child = null;
    });
  }

  function handleMissingProcess() {
    if (stopping || isChildRunning()) return;
    const { count, alert } = tracker.recordRestart();
    if (alert) {
      log.alert(
        `Restart storm: ${count} restarts within ${config.restartWindowMs}ms (limit ${config.maxRestarts})`,
      );
    } else {
      log.info(`Relaunching POS (restart ${count} in window)`);
    }
    spawnPos();
  }

  /** @type {NodeJS.Timeout | null} */
  let interval = null;

  return {
    start() {
      if (!config.enabled) {
        log.info('Watchdog disabled (WATCHDOG_ENABLED=false)');
        return;
      }
      log.info('Watchdog started');
      spawnPos();
      interval = setInterval(handleMissingProcess, config.checkIntervalMs);
    },

    async stop() {
      stopping = true;
      if (interval) clearInterval(interval);
      if (child && isChildRunning()) {
        child.kill('SIGTERM');
        await new Promise((resolve) => {
          if (!child) return resolve();
          child.once('exit', () => resolve());
          setTimeout(resolve, 3000);
        });
      }
      log.info('Watchdog stopped');
    },

    getChild() {
      return child;
    },

    isChildRunning,
    tracker,
    log,
  };
}

export async function runWatchdog() {
  const config = loadConfig();
  const wd = createWatchdog(config);
  wd.start();

  const shutdown = async () => {
    await wd.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
