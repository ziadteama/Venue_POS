/** Setup wizard bridge — Electron IPC when available; otherwise local-agent proxy (no CORS). */

export const DEV_STORAGE_KEY = 'venue-pos-dev-setup-config';

export function hasElectronBridge() {
  return Boolean(window.venuePos?.testConnection && window.venuePos?.saveConfig);
}

/** Browser / non-Electron: route setup tests via local agent (server-side fetch). */
export function canUseAgentSetupBridge() {
  return !hasElectronBridge();
}

/** @deprecated use canUseAgentSetupBridge */
export function canUseDevBrowserBridge() {
  return import.meta.env.DEV && canUseAgentSetupBridge();
}

function agentUrlFromForm(form) {
  const host = String(form.agentLanHost ?? '').trim() || '127.0.0.1';
  const port = form.agentLanPort ?? 3456;
  return `http://${host}:${port}`;
}

export function readDevBrowserConfig() {
  try {
    const raw = localStorage.getItem(DEV_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadSetupConfig() {
  if (window.venuePos?.getConfig) {
    return window.venuePos.getConfig();
  }
  return readDevBrowserConfig();
}

export async function detectSetupLanHost() {
  if (window.venuePos?.detectLanHost) {
    return window.venuePos.detectLanHost();
  }
  return '';
}

async function testConnectionsViaAgent(form) {
  const agentUrl = agentUrlFromForm(form);
  const res = await fetch(`${agentUrl}/v1/setup/test-connection`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apiUrl: form.apiUrl,
      terminalId: form.terminalId,
      terminalSecret: form.terminalSecret,
      agentLanHost: form.agentLanHost,
      agentLanPort: form.agentLanPort,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Setup test failed (${res.status})`);
  }
  return res.json();
}

export async function testSetupConnections(form) {
  if (window.venuePos?.testConnection) {
    return window.venuePos.testConnection(form);
  }
  if (canUseAgentSetupBridge()) {
    return testConnectionsViaAgent(form);
  }
  return null;
}

export async function saveSetupConfig(payload) {
  if (window.venuePos?.saveConfig) {
    const result = await window.venuePos.saveConfig(payload);
    try {
      const agentUrl = agentUrlFromForm(payload);
      await fetch(`${agentUrl}/v1/setup/save-config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          setupComplete: true,
          setupValidatedAt: payload.setupValidatedAt ?? new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      // Agent pin sync is best-effort after Electron config write
    }
    return result;
  }
  if (!canUseAgentSetupBridge()) {
    return null;
  }
  const agentUrl = agentUrlFromForm(payload);
  const res = await fetch(`${agentUrl}/v1/setup/save-config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      setupComplete: true,
      setupValidatedAt: payload.setupValidatedAt ?? new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Setup save failed (${res.status})`);
  }
  const result = await res.json();
  const cfg = {
    ...payload,
    ...result.config,
    agentUrl,
    terminalSecret: payload.terminalSecret,
    setupComplete: true,
  };
  localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(cfg));
  return { config: cfg, restartAgent: result.restartAgent };
}

export function getSetupBridgeMode() {
  if (hasElectronBridge()) return 'electron';
  if (canUseAgentSetupBridge()) return 'agent-proxy';
  return 'none';
}
