import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVenueLanConfig, isValidLanHost, resolveTerminalLanHost } from './terminal-lan-service.js';

test('isValidLanHost accepts dotted IPv4 and empty', () => {
  assert.equal(isValidLanHost(''), true);
  assert.equal(isValidLanHost('192.168.1.21'), true);
  assert.equal(isValidLanHost('999.1.1.1'), true);
  assert.equal(isValidLanHost('not-an-ip'), false);
});

test('resolveTerminalLanHost prefers assigned over reported', () => {
  assert.equal(
    resolveTerminalLanHost({ assignedLanHost: '192.168.1.21', lastLanHost: '10.0.0.5' }),
    '192.168.1.21',
  );
  assert.equal(resolveTerminalLanHost({ lastLanHost: '10.0.0.5' }), '10.0.0.5');
});

test('buildVenueLanConfig excludes self and uses coordinator assigned IP', async () => {
  const prisma = {
    terminal: {
      findMany: async () => [
        {
          id: 'self',
          name: 'POS-1',
          assignedLanHost: '192.168.1.21',
          lastLanHost: null,
          lastLanPort: 3456,
          isCoordinator: true,
          coordinatorLanHost: null,
        },
        {
          id: 'peer',
          name: 'POS-2',
          assignedLanHost: '192.168.1.22',
          lastLanHost: null,
          lastLanPort: 3456,
          isCoordinator: false,
          coordinatorLanHost: null,
        },
      ],
    },
  };

  const config = await buildVenueLanConfig(prisma, 'venue-1', 'self');
  assert.equal(config.coordinatorTerminalId, 'self');
  assert.equal(config.coordinatorLanHost, '192.168.1.21');
  assert.equal(config.peers.length, 1);
  assert.equal(config.peers[0].lanHost, '192.168.1.22');
});
