const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  writeConfig,
  buildAgentEnv,
  isConfigComplete,
  writeUpdaterEnv,
  sanitizeConfigForRenderer,
  defaultReceiptPrinterMode,
} = require('./config-store.cjs');

test('isConfigComplete requires setupValidatedAt', () => {
  const { isConfigComplete: complete } = require('./config-store.cjs');
  assert.equal(
    complete({
      setupComplete: true,
      apiUrl: 'https://hub.example.com',
      terminalId: '00000000-0000-4000-8000-000000000001',
      terminalSecret: 'secret',
      agentUrl: 'http://127.0.0.1:3456',
    }),
    false,
  );
  assert.equal(
    complete({
      setupComplete: true,
      apiUrl: 'https://hub.example.com',
      terminalId: '00000000-0000-4000-8000-000000000001',
      terminalSecret: 'secret',
      agentUrl: 'http://127.0.0.1:3456',
      setupValidatedAt: '2026-06-12T00:00:00.000Z',
    }),
    true,
  );
});

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

test('buildAgentEnv uses cups receipt printer on Linux', () => {
  const env = buildAgentEnv(
    {
      terminalId: '00000000-0000-4000-8000-000000000001',
      terminalSecret: 'secret',
      apiUrl: 'https://hub.example.com',
      agentLanPort: 3456,
    },
    { platform: 'linux' },
  );
  assert.match(env, /RECEIPT_PRINTER_MODE=cups/);
  assert.match(env, /RECEIPT_PRINTER_NAME=VenueReceipt/);
  assert.match(env, /FEATURE_CASH_DRAWER=true/);
});

test('buildAgentEnv uses windows receipt printer on Windows', () => {
  const env = buildAgentEnv(
    {
      terminalId: '00000000-0000-4000-8000-000000000001',
      terminalSecret: 'secret',
      apiUrl: 'https://hub.example.com',
      agentLanPort: 3456,
    },
    { platform: 'win32' },
  );
  assert.match(env, /RECEIPT_PRINTER_MODE=windows/);
  assert.doesNotMatch(env, /RECEIPT_PRINTER_NAME=/);
});

test('defaultReceiptPrinterMode is platform-specific', () => {
  assert.equal(defaultReceiptPrinterMode('linux'), 'cups');
  assert.equal(defaultReceiptPrinterMode('win32'), 'windows');
});

test('writeConfig marks setup complete when saved', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-config-'));
  const saved = writeConfig(tmp, {
    apiUrl: 'https://hub.example.com',
    terminalId: '00000000-0000-4000-8000-000000000099',
    terminalSecret: 'sec',
    setupComplete: true,
    setupValidatedAt: '2026-06-12T00:00:00.000Z',
  });
  assert.equal(isConfigComplete(saved), true);
  const raw = JSON.parse(fs.readFileSync(path.join(tmp, 'pos-config.json'), 'utf8'));
  assert.equal(raw.apiUrl, 'https://hub.example.com');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('writeConfig preserves githubUpdateToken when not re-sent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-config-'));
  writeConfig(tmp, {
    apiUrl: 'https://hub.example.com',
    terminalId: '00000000-0000-4000-8000-000000000099',
    terminalSecret: 'sec',
    setupValidatedAt: '2026-06-12T00:00:00.000Z',
    githubUpdateToken: 'ghp_keep',
  });
  const saved = writeConfig(tmp, { deviceLabel: 'Till 1' });
  assert.equal(saved.githubUpdateToken, 'ghp_keep');
  const safe = sanitizeConfigForRenderer(saved);
  assert.equal(safe.githubUpdateToken, '');
  assert.equal(safe.hasGithubUpdateToken, true);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('writeUpdaterEnv writes GH_TOKEN file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-updater-'));
  const envPath = path.join(tmp, '.env.updater');
  const prev = process.env.VENUE_POS_UPDATER_ENV_PATH;
  process.env.VENUE_POS_UPDATER_ENV_PATH = envPath;
  const result = writeUpdaterEnv({ githubUpdateToken: 'ghp_test' });
  assert.equal(result.written, true);
  assert.match(fs.readFileSync(envPath, 'utf8'), /GH_TOKEN=ghp_test/);
  if (prev === undefined) delete process.env.VENUE_POS_UPDATER_ENV_PATH;
  else process.env.VENUE_POS_UPDATER_ENV_PATH = prev;
  fs.rmSync(tmp, { recursive: true, force: true });
});
