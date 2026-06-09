import { apiFetch } from './api-fetch.js';

export async function sendTerminalHeartbeat({
  apiUrl,
  terminalId,
  terminalSecret,
  profile = {},
}) {
  return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/terminals/heartbeat', {
    method: 'POST',
    body: JSON.stringify(profile),
  });
}

export async function sendDeviceRegistration({
  apiUrl,
  terminalId,
  terminalSecret,
  profile,
}) {
  return sendTerminalHeartbeat({ apiUrl, terminalId, terminalSecret, profile });
}
