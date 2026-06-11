const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_GITHUB_OWNER,
  DEFAULT_GITHUB_REPO,
  resolveFeedUrl,
  resolveUpdateFeed,
} = require('./updater-feed.cjs');

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

test('resolveUpdateFeed defaults to GitHub releases', () => {
  const feed = resolveUpdateFeed({}, {});
  assert.deepEqual(feed, {
    provider: 'github',
    owner: DEFAULT_GITHUB_OWNER,
    repo: DEFAULT_GITHUB_REPO,
  });
  assert.equal(DEFAULT_GITHUB_OWNER, 'ziadteama');
  assert.equal(DEFAULT_GITHUB_REPO, 'Venue_POS');
});

test('resolveUpdateFeed uses generic when POS_UPDATE_FEED_URL is set', () => {
  const feed = resolveUpdateFeed({}, { POS_UPDATE_FEED_URL: 'https://cdn.example.com/pos' });
  assert.deepEqual(feed, { provider: 'generic', url: 'https://cdn.example.com/pos' });
});

test('resolveUpdateFeed allows GitHub owner/repo override', () => {
  const feed = resolveUpdateFeed({}, { POS_GH_OWNER: 'acme', POS_GH_REPO: 'pos-app' });
  assert.deepEqual(feed, { provider: 'github', owner: 'acme', repo: 'pos-app' });
});
