import { apiFetch } from './api-fetch.js';

export async function sendTerminalHeartbeat({
  apiUrl,
  terminalId,
  terminalSecret,
  syncQueueDepth,
}) {
  return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/terminals/heartbeat', {
    method: 'POST',
    body: JSON.stringify({ syncQueueDepth }),
  });
}
