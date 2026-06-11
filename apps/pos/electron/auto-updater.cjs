const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const { resolveFeedUrl } = require('./updater-feed.cjs');

/** @typedef {'idle'|'checking'|'available'|'downloading'|'ready'|'error'} UpdatePhase */

function isUpdaterEnabled(env = process.env) {
  return app.isPackaged && env.NODE_ENV !== 'development';
}

/**
 * @param {{ getConfig: () => object, getMainWindow: () => import('electron').BrowserWindow | null }} deps
 */
function createAutoUpdater(deps) {
  /** @type {UpdatePhase} */
  let phase = 'idle';
  let pendingVersion = '';
  let lastError = '';
  let feedConfigured = false;
  let installAfterDownload = false;

  function send(channel, payload = {}) {
    const win = deps.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  function setPhase(next, extra = {}) {
    phase = next;
    if (extra.version) pendingVersion = extra.version;
    if (extra.error) lastError = extra.error;
    send('update:status', { phase, version: pendingVersion, error: lastError });
  }

  function applyFeedHeaders(cfg) {
    autoUpdater.requestHeaders = {
      'X-Terminal-ID': cfg.terminalId || '',
      'X-Terminal-Secret': cfg.terminalSecret || '',
    };
  }

  function configureFeed() {
    const cfg = deps.getConfig();
    const url = resolveFeedUrl(cfg);
    if (!url) {
      feedConfigured = false;
      return false;
    }
    applyFeedHeaders(cfg);
    autoUpdater.setFeedURL({ provider: 'generic', url });
    feedConfigured = true;
    return true;
  }

  function attachListeners() {
    autoUpdater.removeAllListeners();

    autoUpdater.on('checking-for-update', () => {
      setPhase('checking');
    });

    autoUpdater.on('update-available', (info) => {
      setPhase('available', { version: info?.version ?? '' });
      send('update:available', { version: info?.version ?? '' });
    });

    autoUpdater.on('update-not-available', () => {
      setPhase('idle');
      send('update:not-available', {});
    });

    autoUpdater.on('download-progress', (progress) => {
      setPhase('downloading', { version: pendingVersion });
      send('update:download-progress', { percent: progress?.percent ?? 0 });
    });

    autoUpdater.on('update-downloaded', (info) => {
      setPhase('ready', { version: info?.version ?? pendingVersion });
      send('update:downloaded', { version: info?.version ?? pendingVersion });
      if (installAfterDownload) {
        installAfterDownload = false;
        setImmediate(() => autoUpdater.quitAndInstall(false, true));
      }
    });

    autoUpdater.on('error', (err) => {
      const message = err?.message ?? String(err);
      setPhase('error', { error: message });
      send('update:error', { message });
    });
  }

  function init() {
    if (!isUpdaterEnabled()) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    attachListeners();
  }

  async function checkForUpdates() {
    if (!isUpdaterEnabled()) {
      return { enabled: false, reason: 'unpackaged_or_dev' };
    }
    if (!configureFeed()) {
      return { enabled: false, reason: 'no_feed_url' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { enabled: true, updateInfo: result?.updateInfo ?? null };
    } catch (err) {
      const message = err?.message ?? String(err);
      setPhase('error', { error: message });
      return { enabled: true, error: message };
    }
  }

  async function downloadUpdate() {
    if (!isUpdaterEnabled() || !feedConfigured) {
      if (!configureFeed()) return { ok: false, reason: 'no_feed_url' };
    }
    try {
      setPhase('downloading', { version: pendingVersion });
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      setPhase('error', { error: message });
      return { ok: false, error: message };
    }
  }

  function quitAndInstall() {
    if (!isUpdaterEnabled()) return { ok: false, reason: 'disabled' };
    if (phase === 'ready') {
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    }
    installAfterDownload = true;
    if (phase !== 'downloading') {
      void downloadUpdate();
    }
    return { ok: true, pending: true };
  }

  function getStatus() {
    return {
      enabled: isUpdaterEnabled(),
      feedConfigured,
      phase,
      version: pendingVersion,
      error: lastError,
      feedUrl: resolveFeedUrl(deps.getConfig()),
    };
  }

  function scheduleStartupCheck(delayMs = 60_000) {
    if (!isUpdaterEnabled()) return;
    setTimeout(() => {
      void checkForUpdates();
    }, delayMs);
  }

  function registerIpc(ipcMain) {
    ipcMain.handle('updater:check', () => checkForUpdates());
    ipcMain.handle('updater:download', () => downloadUpdate());
    ipcMain.handle('updater:quitAndInstall', () => quitAndInstall());
    ipcMain.handle('updater:status', () => getStatus());
  }

  return {
    init,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    getStatus,
    scheduleStartupCheck,
    registerIpc,
  };
}

module.exports = {
  createAutoUpdater,
  isUpdaterEnabled,
  resolveFeedUrl,
};
