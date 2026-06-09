import { collectPeerHosts, resolveCoordinatorHost } from '../services/lan-config.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('collectPeerHosts prefers assigned IP and skips self', () => {
  const hosts = collectPeerHosts({
    envPeers: ['192.168.1.10'],
    ownLanHost: '192.168.1.10',
    lanConfig: {
      peers: [
        { terminalId: 'a', assignedLanHost: '192.168.1.11' },
        { terminalId: 'b', lastLanHost: '192.168.1.12' },
      ],
    },
  });
  assert.deepEqual(hosts.sort(), ['192.168.1.10', '192.168.1.11', '192.168.1.12'].sort());
});

test('resolveCoordinatorHost keeps env override over hub config', () => {
  assert.equal(
    resolveCoordinatorHost({
      envCoordinatorHost: '10.0.0.5',
      lanConfig: { coordinatorLanHost: '192.168.1.50' },
    }),
    '10.0.0.5',
  );
  assert.equal(
    resolveCoordinatorHost({
      envCoordinatorHost: '',
      lanConfig: { coordinatorLanHost: '192.168.1.50' },
    }),
    '192.168.1.50',
  );
});
