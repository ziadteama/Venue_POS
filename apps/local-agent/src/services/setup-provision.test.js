import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentEnv, isUuid, normalizeUrl, parseSaveBody } from './setup-provision.js';

test('normalizeUrl adds https when scheme missing', () => {
  assert.equal(normalizeUrl('venue-pos-api.onrender.com'), 'https://venue-pos-api.onrender.com');
});

test('parseSaveBody validates terminal UUID', () => {
  const bad = parseSaveBody({ apiUrl: 'https://hub.example.com', terminalId: 'nope', terminalSecret: 'x' });
  assert.equal(bad.error, 'terminalId must be a UUID');
  const ok = parseSaveBody({
    apiUrl: 'https://hub.example.com',
    terminalId: '00000000-0000-4000-8000-000000000001',
    terminalSecret: 'secret',
    venueId: '00000000-0000-4000-8000-000000000095',
  });
  assert.equal(ok.error, undefined);
  assert.equal(isUuid(ok.value.terminalId), true);
});

test('buildAgentEnv writes production api url', () => {
  const env = buildAgentEnv({
    apiUrl: 'https://venue-pos-api.onrender.com',
    terminalId: '00000000-0000-4000-8000-000000000001',
    terminalSecret: 'secret',
    venueId: '00000000-0000-4000-8000-000000000095',
    agentLanHost: '192.168.1.10',
    agentLanPort: 3456,
  });
  assert.match(env, /SERVER_API_URL=https:\/\/venue-pos-api\.onrender\.com/);
  assert.match(env, /TERMINAL_ID=00000000-0000-4000-8000-000000000001/);
});
