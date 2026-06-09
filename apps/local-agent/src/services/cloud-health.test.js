import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLoopbackUrl,
  probeCloudHealth,
  resetCloudHealthForTests,
  isCloudOnline,
} from './cloud-health.js';

test('normalizeLoopbackUrl maps localhost to 127.0.0.1', () => {
  assert.equal(normalizeLoopbackUrl('http://localhost:3000/health'), 'http://127.0.0.1:3000/health');
});

test('probeCloudHealth requires consecutive failures before going offline', async () => {
  resetCloudHealthForTests();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({ ok: false });

  assert.equal(isCloudOnline(), true);
  await probeCloudHealth('http://127.0.0.1:9/health', { force: true });
  assert.equal(isCloudOnline(), true, 'first failure should not flip offline');
  await probeCloudHealth('http://127.0.0.1:9/health', { force: true });
  assert.equal(isCloudOnline(), false, 'second failure should flip offline');

  globalThis.fetch = originalFetch;
  resetCloudHealthForTests();
});
