const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CONFIG_VERSION = 1;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULTS = {
  apiUrl: '',
  agentUrl: 'http://127.0.0.1:3456',
  terminalId: '',
  terminalSecret: '',
  venueId: '',
  kitchenPrinterHost: '',
  kitchenPrinterPort: 9100,
  receiptPrinterHost: '',
  receiptPrinterPort: 9100,
  agentLanHost: '',
  agentLanPort: 3456,
  agentLanSecret: '',
  isCoordinator: false,
  coordinatorFallbackEnabled: false,
  kioskMode: true,
  setupComplete: false,
  configVersion: CONFIG_VERSION,
  /** Generic electron-updater feed base URL (optional; falls back to POS_UPDATE_FEED_URL env). */
  updateFeedUrl: '',
  /** GitHub PAT for private releases (optional; prefer GH_TOKEN in .env.updater). */
  githubUpdateToken: '',
};

function resolveAgentRoot() {
  if (process.env.VENUE_POS_AGENT_ROOT) {
    return path.resolve(process.env.VENUE_POS_AGENT_ROOT);
  }
  if (process.platform === 'linux' && fs.existsSync('/opt/venue-pos/local-agent')) {
    return '/opt/venue-pos/local-agent';
  }
  return path.resolve(__dirname, '../../local-agent');
}

function resolveConfigPath(userDataPath) {
  return path.join(userDataPath, 'pos-config.json');
}

function normalizeUrl(url, { trailingSlash = false } = {}) {
  if (!url || typeof url !== 'string') return '';
  let s = url.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  s = s.replace(/\/+$/, '');
  return trailingSlash ? `${s}/` : s;
}

function detectLanHost() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function mergeConfig(raw) {
  const merged = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  merged.apiUrl = normalizeUrl(merged.apiUrl);
  merged.agentUrl = normalizeUrl(merged.agentUrl) || DEFAULTS.agentUrl;
  merged.kitchenPrinterPort = Number(merged.kitchenPrinterPort) || 9100;
  merged.receiptPrinterPort = Number(merged.receiptPrinterPort) || 9100;
  merged.agentLanPort = Number(merged.agentLanPort) || 3456;
  merged.isCoordinator = Boolean(merged.isCoordinator);
  merged.coordinatorFallbackEnabled = Boolean(merged.coordinatorFallbackEnabled);
  merged.kioskMode = merged.kioskMode !== false;
  merged.updateFeedUrl = normalizeUrl(merged.updateFeedUrl);
  merged.githubUpdateToken = String(merged.githubUpdateToken ?? '').trim();
  merged.configVersion = CONFIG_VERSION;
  return merged;
}

function isUuid(value) {
  return UUID_RE.test(String(value ?? ''));
}

function isConfigComplete(cfg) {
  return Boolean(
    cfg?.setupComplete &&
      cfg.apiUrl &&
      isUuid(cfg.terminalId) &&
      cfg.terminalSecret &&
      cfg.agentUrl,
  );
}

function readConfig(userDataPath) {
  const filePath = resolveConfigPath(userDataPath);
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return mergeConfig(raw);
  } catch {
    const envFallback = mergeConfig({
      apiUrl: process.env.VITE_API_URL ?? '',
      agentUrl: process.env.VITE_LOCAL_AGENT_URL ?? DEFAULTS.agentUrl,
      terminalId: process.env.VITE_TERMINAL_ID ?? '',
      terminalSecret: process.env.VITE_TERMINAL_SECRET ?? '',
      venueId: process.env.VITE_VENUE_ID ?? '',
      kioskMode: process.env.ELECTRON_IS_KIOSK !== 'false',
      // Dev .env pre-fills values but does not skip the wizard — only pos-config.json does.
      setupComplete: false,
    });
    return envFallback;
  }
}

function writeConfig(userDataPath, partial) {
  const filePath = resolveConfigPath(userDataPath);
  const current = readConfig(userDataPath);
  const patch = { ...(partial && typeof partial === 'object' ? partial : {}) };
  if (!String(patch.githubUpdateToken ?? '').trim()) {
    delete patch.githubUpdateToken;
  }
  const next = mergeConfig({ ...current, ...patch, setupComplete: true });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

function resolveUpdaterEnvPath() {
  if (process.env.VENUE_POS_UPDATER_ENV_PATH) {
    return path.resolve(process.env.VENUE_POS_UPDATER_ENV_PATH);
  }
  if (process.platform === 'linux' && fs.existsSync('/opt/venue-pos/pos')) {
    return '/opt/venue-pos/pos/.env.updater';
  }
  return path.resolve(__dirname, '../.env.updater');
}

function writeUpdaterEnv(cfg) {
  const token = String(cfg.githubUpdateToken ?? '').trim();
  const envPath = resolveUpdaterEnvPath();
  if (!token) {
    return { written: false, envPath, reason: 'no_token' };
  }
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `GH_TOKEN=${token}\n`, { mode: 0o600 });
  if (process.platform === 'linux') {
    try {
      const { execSync } = require('node:child_process');
      execSync(`chown venuepos:venuepos "${envPath}"`, { stdio: 'ignore' });
    } catch {
      // non-fatal on dev machines
    }
  }
  return { written: true, envPath };
}

/** Strip secrets before sending config to the renderer. */
function sanitizeConfigForRenderer(cfg) {
  return {
    ...cfg,
    githubUpdateToken: '',
    hasGithubUpdateToken: Boolean(cfg.githubUpdateToken),
  };
}

function buildAgentEnv(cfg) {
  const lines = [
    `PORT=${cfg.agentLanPort}`,
    'HOST=0.0.0.0',
    'SQLITE_PATH=./data/local.db',
    'SQLITE_WAL_MODE=true',
    `TERMINAL_ID=${cfg.terminalId}`,
    `TERMINAL_SECRET=${cfg.terminalSecret}`,
    `VENUE_ID=${cfg.venueId || ''}`,
    `SERVER_API_URL=${cfg.apiUrl}`,
    `CLOUD_HEALTH_URL=${cfg.apiUrl}/health`,
    `AGENT_LAN_PORT=${cfg.agentLanPort}`,
    `AGENT_LAN_HOST=${cfg.agentLanHost || detectLanHost()}`,
    `AGENT_LAN_SECRET=${cfg.agentLanSecret || ''}`,
    'AGENT_PEERS=',
    'AGENT_PRIORITY=50',
    `AGENT_DEVICE_LABEL=${cfg.deviceLabel || ''}`,
    `KITCHEN_PRINTER_HOST=${cfg.kitchenPrinterHost || ''}`,
    `KITCHEN_PRINTER_PORT=${cfg.kitchenPrinterPort}`,
    'RECEIPT_PRINTER_MODE=windows',
    'FEATURE_CASH_DRAWER=true',
    `COORDINATOR_TERMINAL_ID=${cfg.isCoordinator ? cfg.terminalId : ''}`,
    `COORDINATOR_LAN_HOST=${cfg.isCoordinator ? cfg.agentLanHost || detectLanHost() : ''}`,
    `COORDINATOR_FALLBACK_ENABLED=${cfg.coordinatorFallbackEnabled ? 'true' : 'false'}`,
    `IS_COORDINATOR=${cfg.isCoordinator ? 'true' : 'false'}`,
    'CORS_ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174',
  ];
  return `${lines.join('\n')}\n`;
}

function writeAgentEnv(cfg) {
  const agentRoot = resolveAgentRoot();
  const envPath = path.join(agentRoot, '.env');
  fs.mkdirSync(agentRoot, { recursive: true });
  fs.mkdirSync(path.join(agentRoot, 'data'), { recursive: true });
  fs.writeFileSync(envPath, buildAgentEnv(cfg), 'utf8');
  return envPath;
}

async function testConnections(cfg) {
  const results = { api: null, agent: null, terminal: null };
  const apiUrl = normalizeUrl(cfg.apiUrl);
  const agentUrl = normalizeUrl(cfg.agentUrl) || DEFAULTS.agentUrl;

  try {
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(8000) });
    results.api = { ok: res.ok, status: res.status };
  } catch (err) {
    results.api = { ok: false, error: err.message };
  }

  try {
    const res = await fetch(`${agentUrl}/health`, { signal: AbortSignal.timeout(5000) });
    results.agent = { ok: res.ok, status: res.status };
  } catch (err) {
    results.agent = { ok: false, error: err.message };
  }

  if (cfg.terminalId && cfg.terminalSecret) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/features`, {
        headers: {
          'x-terminal-id': cfg.terminalId,
          'x-terminal-secret': cfg.terminalSecret,
        },
        signal: AbortSignal.timeout(8000),
      });
      results.terminal = { ok: res.ok, status: res.status };
    } catch (err) {
      results.terminal = { ok: false, error: err.message };
    }
  }

  return results;
}

function restartAgentService() {
  if (process.platform !== 'linux') {
    return { restarted: false, reason: 'not_linux' };
  }
  const { execSync } = require('node:child_process');
  try {
    execSync('systemctl restart venue-pos-agent', { stdio: 'ignore' });
    return { restarted: true };
  } catch {
    return { restarted: false, reason: 'systemctl_failed' };
  }
}

module.exports = {
  CONFIG_VERSION,
  DEFAULTS,
  detectLanHost,
  isConfigComplete,
  readConfig,
  writeConfig,
  buildAgentEnv,
  writeAgentEnv,
  writeUpdaterEnv,
  sanitizeConfigForRenderer,
  testConnections,
  restartAgentService,
  resolveAgentRoot,
  resolveUpdaterEnvPath,
};
