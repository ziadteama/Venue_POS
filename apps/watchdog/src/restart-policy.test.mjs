import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRestartTracker } from './restart-policy.mjs';

test('does not alert within max restarts', () => {
  const tracker = createRestartTracker(3, 600_000);
  const t0 = 1_000_000;
  assert.deepEqual(tracker.recordRestart(t0), { count: 1, alert: false });
  assert.deepEqual(tracker.recordRestart(t0 + 1000), { count: 2, alert: false });
  assert.deepEqual(tracker.recordRestart(t0 + 2000), { count: 3, alert: false });
});

test('alerts when restarts exceed max in window', () => {
  const tracker = createRestartTracker(3, 600_000);
  const t0 = 1_000_000;
  tracker.recordRestart(t0);
  tracker.recordRestart(t0 + 1000);
  tracker.recordRestart(t0 + 2000);
  const fourth = tracker.recordRestart(t0 + 3000);
  assert.equal(fourth.count, 4);
  assert.equal(fourth.alert, true);
});

test('drops restarts outside sliding window', () => {
  const tracker = createRestartTracker(3, 10_000);
  const t0 = 1_000_000;
  tracker.recordRestart(t0);
  tracker.recordRestart(t0 + 1000);
  tracker.recordRestart(t0 + 2000);
  const afterWindow = tracker.recordRestart(t0 + 20_000);
  assert.equal(afterWindow.count, 1);
  assert.equal(afterWindow.alert, false);
});

test('reset clears history', () => {
  const tracker = createRestartTracker(3, 600_000);
  tracker.recordRestart();
  tracker.recordRestart();
  tracker.reset();
  assert.deepEqual(tracker.recordRestart(), { count: 1, alert: false });
});
