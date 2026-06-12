import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value ?? '').trim());
}

export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let s = url.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  return s.replace(/\/+$/, '');
}

export function detectLanHost() {
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

function resolveAgentRoot() {
  if (process.env.VENUE_POS_AGENT_ROOT) {
    return path.resolve(process.env.VENUE_POS_AGENT_ROOT);
  }
  return path.resolve(process.cwd());
}

function receiptPrinterEnvLines(cfg) {
  const mode = (cfg.receiptPrinterMode || '').trim() || 'cups';
  const lines = [`RECEIPT_PRINTER_MODE=${mode}`, 'FEATURE_CASH_DRAWER=true'];
  if (mode === 'network') {
    const host = (cfg.receiptPrinterHost || '').trim();
    if (host) lines.push(`RECEIPT_PRINTER_HOST=${host}`);
    lines.push(`RECEIPT_PRINTER_PORT=${cfg.receiptPrinterPort || 9100}`);
  }
  return lines;
}

export function buildAgentEnv(cfg) {
  const apiUrl = normalizeUrl(cfg.apiUrl);
  const agentLanHost = cfg.agentLanHost || detectLanHost();
  const agentLanPort = Number(cfg.agentLanPort) || 3456;
  const lines = [
    `PORT=${agentLanPort}`,
    'HOST=0.0.0.0',
    'SQLITE_PATH=./data/local.db',
    'SQLITE_WAL_MODE=true',
    `TERMINAL_ID=${cfg.terminalId}`,
    `TERMINAL_SECRET=${cfg.terminalSecret}`,
    `VENUE_ID=${cfg.venueId || ''}`,
    `SERVER_API_URL=${apiUrl}`,
    `CLOUD_HEALTH_URL=${apiUrl}/health`,
    `AGENT_LAN_PORT=${agentLanPort}`,
    `AGENT_LAN_HOST=${agentLanHost}`,
    `AGENT_LAN_SECRET=${cfg.agentLanSecret || ''}`,
    'AGENT_PEERS=',
    'AGENT_PRIORITY=50',
    `AGENT_DEVICE_LABEL=${cfg.deviceLabel || ''}`,
    `KITCHEN_PRINTER_HOST=${cfg.kitchenPrinterHost || ''}`,
    `KITCHEN_PRINTER_PORT=${cfg.kitchenPrinterPort || 9100}`,
    ...receiptPrinterEnvLines(cfg),
    `COORDINATOR_TERMINAL_ID=${cfg.isCoordinator ? cfg.terminalId : ''}`,
    `COORDINATOR_LAN_HOST=${cfg.isCoordinator ? agentLanHost : ''}`,
    `COORDINATOR_FALLBACK_ENABLED=${cfg.coordinatorFallbackEnabled ? 'true' : 'false'}`,
    `IS_COORDINATOR=${cfg.isCoordinator ? 'true' : 'false'}`,
    'CORS_ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174',
  ];
  return `${lines.join('\n')}\n`;
}

export function writeAgentEnvFile(cfg) {
  const agentRoot = resolveAgentRoot();
  const envPath = path.join(agentRoot, '.env');
  fs.mkdirSync(agentRoot, { recursive: true });
  fs.mkdirSync(path.join(agentRoot, 'data'), { recursive: true });
  fs.writeFileSync(envPath, buildAgentEnv(cfg), 'utf8');
  return envPath;
}

export function parseSaveBody(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const apiUrl = normalizeUrl(raw.apiUrl);
  const terminalId = String(raw.terminalId ?? '').trim();
  const terminalSecret = String(raw.terminalSecret ?? '').trim();
  if (!apiUrl) return { error: 'apiUrl required' };
  if (!isUuid(terminalId)) return { error: 'terminalId must be a UUID' };
  if (!terminalSecret) return { error: 'terminalSecret required' };
  return {
    value: {
      apiUrl,
      terminalId,
      terminalSecret,
      venueId: String(raw.venueId ?? '').trim(),
      kitchenPrinterHost: String(raw.kitchenPrinterHost ?? '').trim(),
      kitchenPrinterPort: Number(raw.kitchenPrinterPort) || 9100,
      agentLanHost: String(raw.agentLanHost ?? '').trim() || detectLanHost(),
      agentLanPort: Number(raw.agentLanPort) || 3456,
      agentLanSecret: String(raw.agentLanSecret ?? '').trim(),
      isCoordinator: Boolean(raw.isCoordinator),
      coordinatorFallbackEnabled: Boolean(raw.coordinatorFallbackEnabled),
      deviceLabel: String(raw.deviceLabel ?? '').trim(),
      setupValidatedAt: String(raw.setupValidatedAt ?? new Date().toISOString()),
    },
  };
}

export function isLocalSetupRequest(request) {
  const ip = String(request.ip ?? '');
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.endsWith('127.0.0.1')
  );
}
