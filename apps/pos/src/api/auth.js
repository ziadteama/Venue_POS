import { AGENT_URL, API_URL, TERMINAL_ID, TERMINAL_SECRET } from '../config.js';

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

  const agentRes = await fetch(`${AGENT_URL}/v1/auth/pin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  const agentData = await agentRes.json().catch(() => ({}));
  if (agentRes.ok) return agentData;

  if (!TERMINAL_ID || !TERMINAL_SECRET) {
    throw new Error(parsePinError(agentData));
  }

  const res = await fetch(`${API_URL}/api/v1/auth/pin`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-terminal-id': TERMINAL_ID,
      'x-terminal-secret': TERMINAL_SECRET,
    },
    body: JSON.stringify({ pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parsePinError(data));
  return data;
}
