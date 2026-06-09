import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../db/sqlite.js';
import {
  buildDeviceProfile,
  resolveDeviceLabel,
  setLocalDeviceLabel,
  setHubDeviceLabel,
} from './device-profile.js';

test('resolveDeviceLabel prefers env then local meta then hub name', () => {
  const db = createDatabase(':memory:');
  assert.equal(resolveDeviceLabel(db, { envLabel: 'Bar POS', terminalId: 'abc' }), 'Bar POS');
  setLocalDeviceLabel(db, 'Local Till');
  assert.equal(resolveDeviceLabel(db, { terminalId: 'abc' }), 'Local Till');
  setHubDeviceLabel(db, 'Hub Name');
  db.prepare(`DELETE FROM agent_meta WHERE key = 'device_label'`).run();
  assert.equal(resolveDeviceLabel(db, { terminalId: 'abc' }), 'Hub Name');
});

test('buildDeviceProfile includes heartbeat fields', () => {
  const db = createDatabase(':memory:');
  setLocalDeviceLabel(db, 'Cafe POS-2');
  const profile = buildDeviceProfile({
    db,
    terminalId: '00000000-0000-4000-8000-000000000002',
    lanHost: '192.168.1.22',
    lanPort: 3456,
    agentPriority: 60,
    clusterMode: 'relay',
    syncQueueDepth: 3,
  });
  assert.equal(profile.deviceLabel, 'Cafe POS-2');
  assert.equal(profile.lanHost, '192.168.1.22');
  assert.equal(profile.lanPort, 3456);
  assert.equal(profile.agentPriority, 60);
  assert.equal(profile.clusterMode, 'relay');
  assert.equal(profile.syncQueueDepth, 3);
});
