const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/** Private GitHub releases — GH_TOKEN in .env.updater (never commit). */
function loadUpdaterEnv() {
  const candidates = [
    path.join(__dirname, '../.env.updater'),
    '/opt/venue-pos/pos/.env.updater',
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      require('dotenv').config({ path: filePath });
      return;
    }
  }
}
loadUpdaterEnv();

const { app, BrowserWindow, ipcMain } = require('electron');
const {
  readConfig,
  writeConfig,
  writeAgentEnv,
  writeUpdaterEnv,
  sanitizeConfigForRenderer,
  testConnections,
  restartAgentService,
  isConfigComplete,
  detectLanHost,
  resolveForceSetup,
} = require('./config-store.cjs');
const { createAutoUpdater } = require('./auto-updater.cjs');

const isDev = process.env.NODE_ENV === 'development';
const KIOSK_MANAGER_EXIT_CODE = 100;

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {ReturnType<typeof createAutoUpdater> | null} */
let appUpdater = null;

let kioskPaused = false;

// Semi-kiosk exit code — hardcoded, not stored in DB or synced from hub.
const SEMI_KIOSK_EXIT_CODE = '7894';

function getUserDataPath() {
  return app.getPath('userData');
}

function pausedMarkerPath() {
  const linuxShared = path.join(os.homedir(), '.local/share/venue-pos/kiosk-paused');
  if (process.platform === 'linux') {
    return linuxShared;
  }
  return path.join(getUserDataPath(), 'kiosk-paused');
}

function writePausedMarker() {
  const marker = pausedMarkerPath();
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, new Date().toISOString());
}

function clearPausedMarker() {
  try {
    const marker = pausedMarkerPath();
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  } catch {
    // non-fatal
  }
}

function currentConfig() {
  return readConfig(getUserDataPath());
}

function isKioskEnabled(cfg) {
  return cfg.kioskMode !== false && (process.env.ELECTRON_IS_KIOSK === 'true' || cfg.kioskMode);
}

/**
 * Semi-kiosk: restore fullscreen when user maximises/restores the window after a pause.
 * We do NOT re-engage OS kiosk mode (kiosk: false always) — Ubuntu desktop stays accessible
 * when intentionally paused, but window snaps back to fullscreen on restore.
 */
function resumeKioskIfNeeded() {
  const cfg = currentConfig();
  if (!kioskPaused || !isKioskEnabled(cfg) || !mainWindow || mainWindow.isDestroyed()) return;
  kioskPaused = false;
  clearPausedMarker();
  // Semi-kiosk: fullscreen only — no OS kiosk mode.
  mainWindow.setFullScreen(true);
  mainWindow.focus();
}

function attachKioskLockdown(win, cfg) {
  if (!isKioskEnabled(cfg)) return;

  win.removeMenu();
  // Re-engage fullscreen when the window is restored from a pause.
  win.on('maximize', resumeKioskIfNeeded);
  win.on('restore', resumeKioskIfNeeded);

  win.webContents.on('context-menu', (event) => {
    if (!kioskPaused) event.preventDefault();
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (kioskPaused) return;
    const key = input.key?.toLowerCase();
    // Block developer / escape shortcuts while POS is in semi-kiosk mode.
    if (input.key === 'F12') event.preventDefault();
    if (input.control && input.shift && key === 'i') event.preventDefault();
    if (input.control && input.shift && key === 'j') event.preventDefault();
    if (input.control && input.shift && key === 'c') event.preventDefault();
    if (input.alt && key === 'f4') event.preventDefault();
    if (input.control && key === 'w') event.preventDefault();
    if (input.control && key === 'q') event.preventDefault();
    if (input.meta) event.preventDefault();
  });

  win.webContents.on('devtools-opened', () => {
    if (!kioskPaused) win.webContents.closeDevTools();
  });

  // Prevent leaving fullscreen via keyboard (F11 / OS shortcuts) while active.
  win.on('leave-full-screen', () => {
    if (!kioskPaused && isKioskEnabled(currentConfig())) {
      // Snap back to fullscreen unless the worker provided the exit code.
      setImmediate(() => {
        if (!kioskPaused && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setFullScreen(true);
        }
      });
    }
  });
}

function createWindow() {
  const cfg = currentConfig();
  const kiosk = isKioskEnabled(cfg);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    // Semi-kiosk: fullscreen but NOT OS kiosk mode — Ubuntu desktop stays behind.
    fullscreen: kiosk,
    kiosk: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  attachKioskLockdown(mainWindow, cfg);

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[pos] Renderer process gone:', details);
    if (mainWindow && !mainWindow.isDestroyed()) {
      loadPos(mainWindow);
    }
  });

  loadPos(mainWindow);
}

function loadPos(win) {
  if (isDev) {
    win.loadURL('http://localhost:5174');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function registerIpc() {
  ipcMain.handle('config:get', () => {
    const cfg = readConfig(getUserDataPath());
    const forceSetup = resolveForceSetup() || !isConfigComplete(cfg);
    return {
      ...sanitizeConfigForRenderer(cfg),
      detectedLanHost: detectLanHost(),
      forceSetup,
      kioskMode: isKioskEnabled(cfg),
    };
  });

  ipcMain.handle('config:isComplete', () => isConfigComplete(readConfig(getUserDataPath())));

  ipcMain.handle('config:save', async (_event, partial) => {
    const saved = writeConfig(getUserDataPath(), partial);
    const envPath = writeAgentEnv(saved);
    const updaterEnv = writeUpdaterEnv(saved);
    const restart = restartAgentService();
    return { config: sanitizeConfigForRenderer(saved), envPath, updaterEnv, restart };
  });

  ipcMain.handle('config:test', async (_event, partial) => {
    const cfg = { ...readConfig(getUserDataPath()), ...partial };
    return testConnections(cfg);
  });

  ipcMain.handle('config:restartAgent', () => restartAgentService());

  ipcMain.handle('config:detectLanHost', () => detectLanHost());

  ipcMain.handle('kiosk:pause', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    kioskPaused = true;
    writePausedMarker();
    // Semi-kiosk: leave fullscreen so the worker can access Ubuntu desktop.
    // We do NOT call setKiosk(false) — we were never in OS kiosk mode.
    mainWindow.setFullScreen(false);
    mainWindow.minimize();
    return { ok: true };
  });

  ipcMain.handle('kiosk:isPaused', () => kioskPaused);

  // Renderer calls this with the worker-entered exit code; main verifies it.
  ipcMain.handle('kiosk:verifyExitCode', (_event, code) => {
    return { ok: String(code) === SEMI_KIOSK_EXIT_CODE };
  });
}

if (isDev && process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

app.whenReady().then(() => {
  registerIpc();
  appUpdater = createAutoUpdater({
    getConfig: () => currentConfig(),
    getMainWindow: () => mainWindow,
  });
  appUpdater.init();
  appUpdater.registerIpc(ipcMain);
  createWindow();
  if (isConfigComplete(currentConfig())) {
    appUpdater.scheduleStartupCheck();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (kioskPaused) {
      app.exit(KIOSK_MANAGER_EXIT_CODE);
      return;
    }
    app.quit();
  }
});
