import { lanFetch } from './lan-fetch.js';

export async function relaySyncEvents({
  relayHost,
  lanPort,
  lanSecret,
  terminalId,
  terminalSecret,
  events,
}) {
  return lanFetch(relayHost, '/v1/relay/sync', {
    lanPort,
    lanSecret,
    method: 'POST',
    body: { events },
    headers: {
      'x-terminal-id': terminalId,
      'x-terminal-secret': terminalSecret,
    },
  });
}

export async function relayFloorAction({
  relayHost,
  lanPort,
  lanSecret,
  terminalId,
  terminalSecret,
  action,
  body,
}) {
  return lanFetch(relayHost, `/v1/relay/floor/${action}`, {
    lanPort,
    lanSecret,
    method: 'POST',
    body,
    headers: {
      'x-terminal-id': terminalId,
      'x-terminal-secret': terminalSecret,
    },
  });
}

export async function relayApiCall({
  relayHost,
  lanPort,
  lanSecret,
  terminalId,
  terminalSecret,
  path,
  method = 'GET',
  body,
}) {
  return lanFetch(relayHost, '/v1/relay/api', {
    lanPort,
    lanSecret,
    method: 'POST',
    body: { path, method, body },
    headers: {
      'x-terminal-id': terminalId,
      'x-terminal-secret': terminalSecret,
    },
  });
}
