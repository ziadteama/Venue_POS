import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testSetupConnections } from './setup-test.js';

test('testSetupConnections probes api, agent, and terminal auth', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('hub.example.com') && u.endsWith('/health')) {
      return { ok: true, status: 200 };
    }
    if (u.endsWith('/health') && u.includes('3456')) {
      return { ok: true, status: 200 };
    }
    if (u.includes('/api/v1/features')) {
      assert.equal(opts.headers?.['x-terminal-id'], '00000000-0000-4000-8000-000000000001');
      assert.equal(opts.headers?.['x-terminal-secret'], 'secret');
      return { ok: true, status: 200 };
    }
    return { ok: false, status: 404 };
  };

  const results = await testSetupConnections({
    apiUrl: 'https://hub.example.com',
    agentLanHost: '127.0.0.1',
    agentLanPort: 3456,
    terminalId: '00000000-0000-4000-8000-000000000001',
    terminalSecret: 'secret',
  });

  assert.equal(results.api.ok, true);
  assert.equal(results.agent.ok, true);
  assert.equal(results.terminal.ok, true);

  globalThis.fetch = originalFetch;
});
