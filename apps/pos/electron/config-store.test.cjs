const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeConfig, buildAgentEnv, isConfigComplete } = require('./config-store.cjs');

test('buildAgentEnv includes terminal and API settings', () => {
  const env = buildAgentEnv({
    terminalId: '00000000-0000-4000-8000-000000000001',
    terminalSecret: 'secret',
    venueId: '00000000-0000-4000-8000-000000000010',
    apiUrl: 'https://hub.example.com',
    agentLanPort: 3456,
    agentLanHost: '192.168.1.21',
    kitchenPrinterHost: '192.168.1.50',
    kitchenPrinterPort: 9100,
    isCoordinator: true,
    coordinatorFallbackEnabled: false,
    kioskMode: true,
  });
  assert.match(env, /TERMINAL_ID=00000000/);
  assert.match(env, /SERVER_API_URL=https:\/\/hub.example.com/);
  assert.match(env, /IS_COORDINATOR=true/);
});

test('writeConfig marks setup complete when saved', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-config-'));
  const saved = writeConfig(tmp, {
    apiUrl: 'https://hub.example.com',
    terminalId: 'tid',
    terminalSecret: 'sec',
    setupComplete: true,
  });
  assert.equal(isConfigComplete(saved), true);
  const raw = JSON.parse(fs.readFileSync(path.join(tmp, 'pos-config.json'), 'utf8'));
  assert.equal(raw.apiUrl, 'https://hub.example.com');
  fs.rmSync(tmp, { recursive: true, force: true });
});
