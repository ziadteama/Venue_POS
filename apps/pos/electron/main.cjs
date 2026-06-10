const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { app, BrowserWindow } = require('electron');

const isDev = process.env.NODE_ENV === 'development';
const isKiosk = process.env.ELECTRON_IS_KIOSK === 'true';

/** @type {BrowserWindow | null} */
let mainWindow = null;

if (isDev && process.platform === 'win32') {
  // Reduces GPU-related renderer crashes on some Windows setups.
  app.disableHardwareAcceleration();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: isKiosk,
    kiosk: isKiosk,
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

  if (isKiosk) {
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
      console.error('[pos] Reloading POS window after renderer exit…');
      loadPos(mainWindow);
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[pos] Renderer became unresponsive');
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

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
