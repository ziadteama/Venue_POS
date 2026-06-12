import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySetupConfig, getRuntimeConfig, initRuntimeConfig } from './runtime-config.js';

test('applySetupConfig updates live credentials without restart', () => {
  initRuntimeConfig({
    apiUrl: 'http://127.0.0.1:3000',
    cloudHealthUrl: 'http://127.0.0.1:3000/health',
    venueId: '',
    terminalId: '00000000-0000-4000-8000-000000000099',
    terminalSecret: 'old',
  });
  applySetupConfig({
    apiUrl: 'https://venue-pos-api.onrender.com',
    terminalId: '00000000-0000-4000-8000-000000000001',
    terminalSecret: 'new-secret',
    venueId: '00000000-0000-4000-8000-000000000095',
  });
  const cfg = getRuntimeConfig();
  assert.equal(cfg.apiUrl, 'https://venue-pos-api.onrender.com');
  assert.equal(cfg.terminalSecret, 'new-secret');
  assert.equal(cfg.cloudHealthUrl, 'https://venue-pos-api.onrender.com/health');
});
