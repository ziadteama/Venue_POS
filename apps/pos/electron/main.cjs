const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { app, BrowserWindow, ipcMain } = require('electron');
const {
  readConfig,
  writeConfig,
  writeAgentEnv,
  testConnections,
  restartAgentService,
  isConfigComplete,
  detectLanHost,
} = require('./config-store.cjs');
const { createAutoUpdater } = require('./auto-updater.cjs');

const isDev = process.env.NODE_ENV === 'development';

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {ReturnType<typeof createAutoUpdater> | null} */
let appUpdater = null;

function getUserDataPath() {
  return app.getPath('userData');
}

function currentConfig() {
  return readConfig(getUserDataPath());
}

function createWindow() {
  const cfg = currentConfig();
  const kiosk = cfg.kioskMode !== false && (process.env.ELECTRON_IS_KIOSK === 'true' || cfg.kioskMode);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: kiosk,
    kiosk,
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

  if (kiosk) {
    mainWindow.removeMenu();
    mainWindow.webContents.on('context-menu', (event) => event.preventDefault());
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = input.key?.toLowerCase();
      if (input.key === 'F12') event.preventDefault();
      if (input.control && input.shift && key === 'i') event.preventDefault();
      if (input.control && input.shift && key === 'j') event.preventDefault();
      if (input.alt && key === 'f4') event.preventDefault();
    });
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

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
    return { ...cfg, detectedLanHost: detectLanHost() };
  });

  ipcMain.handle('config:isComplete', () => isConfigComplete(readConfig(getUserDataPath())));

  ipcMain.handle('config:save', async (_event, partial) => {
    const saved = writeConfig(getUserDataPath(), partial);
    const envPath = writeAgentEnv(saved);
    const restart = restartAgentService();
    return { config: saved, envPath, restart };
  });

  ipcMain.handle('config:test', async (_event, partial) => {
    const cfg = { ...readConfig(getUserDataPath()), ...partial };
    return testConnections(cfg);
  });

  ipcMain.handle('config:restartAgent', () => restartAgentService());

  ipcMain.handle('config:detectLanHost', () => detectLanHost());
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
  if (process.platform !== 'darwin') app.quit();
});
