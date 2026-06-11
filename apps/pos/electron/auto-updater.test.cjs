const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveFeedUrl } = require('./updater-feed.cjs');

test('resolveFeedUrl prefers config over env', () => {
  const url = resolveFeedUrl(
    { updateFeedUrl: 'https://cdn.example.com/pos/' },
    { POS_UPDATE_FEED_URL: 'https://ignored.example.com' },
  );
  assert.equal(url, 'https://cdn.example.com/pos');
});

test('resolveFeedUrl falls back to env and strips trailing slash', () => {
  const url = resolveFeedUrl({}, { POS_UPDATE_FEED_URL: 'https://releases.example.com/pos/' });
  assert.equal(url, 'https://releases.example.com/pos');
});

test('resolveFeedUrl returns null when unset', () => {
  assert.equal(resolveFeedUrl({}, {}), null);
});
