import { AGENT_URL, API_URL, TERMINAL_ID, TERMINAL_SECRET } from '../config.js';

function agentUrl() {
  return AGENT_URL();
}
function apiUrl() {
  return API_URL();
}
function terminalId() {
  return TERMINAL_ID();
}
function terminalSecret() {
  return TERMINAL_SECRET();
}

function parsePinError(body) {
  if (!body) return 'Invalid PIN';
  try {
    const json = typeof body === 'string' ? JSON.parse(body) : body;
    return json.error?.message ?? json.error ?? 'Invalid PIN';
  } catch {
    return typeof body === 'string' && body.length > 120 ? `${body.slice(0, 120)}…` : String(body);
  }
}

/** Cashier PIN login — Electron IPC or local-agent (offline-capable). */
export async function loginWithPin(pin) {
  if (window.venuePos?.loginPin) {
    return window.venuePos.loginPin(pin);
  }

  const agentRes = await fetch(`${agentUrl()}/v1/auth/pin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin }),
  }).catch((err) => {
    if (String(err?.message ?? err).includes('Failed to fetch')) {
      throw new Error(
        'Local agent is not running (127.0.0.1:3456). Restart with npm run dev or npm run dev:agent.',
      );
    }
    throw err;
  });
  const agentData = await agentRes.json().catch(() => ({}));
  if (agentRes.ok) return agentData;

  if (!terminalId() || !terminalSecret()) {
    throw new Error(parsePinError(agentData));
  }

  const res = await fetch(`${apiUrl()}/api/v1/auth/pin`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-terminal-id': terminalId(),
      'x-terminal-secret': terminalSecret(),
    },
    body: JSON.stringify({ pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parsePinError(data));
  return data;
}
