import { API_URL, TERMINAL_ID, TERMINAL_SECRET } from '../config.js';

function parsePinError(body) {
  if (!body) return 'Invalid PIN';
  try {
    const json = JSON.parse(body);
    return json.error?.message ?? 'Invalid PIN';
  } catch {
    return body.length > 120 ? `${body.slice(0, 120)}…` : body;
  }
}

/** Cashier PIN login — Electron IPC or direct API with terminal headers. */
export async function loginWithPin(pin) {
  if (window.venuePos?.loginPin) {
    return window.venuePos.loginPin(pin);
  }

  if (!TERMINAL_ID || !TERMINAL_SECRET) {
    throw new Error('Terminal not configured (VITE_TERMINAL_ID / VITE_TERMINAL_SECRET)');
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
  if (!res.ok) throw new Error(parsePinError(JSON.stringify(data)));
  return data;
}
