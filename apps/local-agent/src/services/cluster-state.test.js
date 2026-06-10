import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLUSTER_MODES, CLUSTER_HYSTERESIS_TICKS } from '@venue-pos/shared';
import { computeClusterState } from './cluster-state.js';

describe('computeClusterState', () => {
  it('returns DIRECT when cloud is online', () => {
    const state = computeClusterState({
      cloudOnline: true,
      terminalId: 't-a',
      agentPriority: 50,
      peers: [],
    });
    assert.equal(state.mode, CLUSTER_MODES.DIRECT);
    assert.equal(state.isDirect, true);
  });

  it('elects RELAY when a peer has cloud online', () => {
    const state = computeClusterState({
      cloudOnline: false,
      terminalId: 't-a',
      agentPriority: 50,
      peers: [{ terminalId: 't-b', host: '192.168.1.22', cloudOnline: true, priority: 10 }],
      previous: { pendingMode: CLUSTER_MODES.RELAY, ticks: 2, stableMode: CLUSTER_MODES.RELAY },
    });
    assert.equal(state.mode, CLUSTER_MODES.RELAY);
    assert.equal(state.relayHost, '192.168.1.22');
  });

  it('elects highest priority peer as leader when all offline', () => {
    const state = computeClusterState({
      cloudOnline: false,
      terminalId: 't-a',
      agentPriority: 10,
      peers: [{ terminalId: 't-b', host: '192.168.1.22', cloudOnline: false, priority: 100 }],
      previous: {
        pendingMode: CLUSTER_MODES.FOLLOWER,
        ticks: 2,
        stableMode: CLUSTER_MODES.FOLLOWER,
        leaderId: 't-b',
        leaderHost: '192.168.1.22',
      },
    });
    assert.equal(state.mode, CLUSTER_MODES.FOLLOWER);
    assert.equal(state.leaderId, 't-b');
    assert.equal(state.leaderHost, '192.168.1.22');
  });

  it('makes self leader when highest priority', () => {
    const state = computeClusterState({
      cloudOnline: false,
      terminalId: 't-a',
      agentPriority: 200,
      peers: [{ terminalId: 't-b', host: '192.168.1.22', cloudOnline: false, priority: 50 }],
      previous: { pendingMode: CLUSTER_MODES.LEADER, ticks: 2, stableMode: CLUSTER_MODES.LEADER },
    });
    assert.equal(state.mode, CLUSTER_MODES.LEADER);
    assert.equal(state.isLeader, true);
  });

  it('holds stable mode for one cloud flap tick', () => {
    const offlineFlap = computeClusterState({
      cloudOnline: false,
      terminalId: 't-a',
      agentPriority: 100,
      peers: [],
      previous: {
        mode: CLUSTER_MODES.DIRECT,
        stableMode: CLUSTER_MODES.DIRECT,
        pendingMode: CLUSTER_MODES.DIRECT,
        ticks: 2,
      },
    });
    assert.equal(offlineFlap.mode, CLUSTER_MODES.DIRECT);

    const onlineFlap = computeClusterState({
      cloudOnline: true,
      terminalId: 't-a',
      agentPriority: 100,
      peers: [],
      previous: {
        mode: CLUSTER_MODES.LEADER,
        stableMode: CLUSTER_MODES.LEADER,
        pendingMode: CLUSTER_MODES.LEADER,
        ticks: 2,
      },
    });
    assert.equal(onlineFlap.mode, CLUSTER_MODES.LEADER);
  });
});
