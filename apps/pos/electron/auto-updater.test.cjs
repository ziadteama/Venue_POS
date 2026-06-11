const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_GITHUB_OWNER,
  DEFAULT_GITHUB_REPO,
  resolveFeedUrl,
  resolveGithubToken,
  buildUpdaterRequestHeaders,
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

test('resolveGithubToken prefers config then GH_TOKEN env', () => {
  assert.equal(resolveGithubToken({ githubUpdateToken: 'cfg' }, { GH_TOKEN: 'env' }), 'cfg');
  assert.equal(resolveGithubToken({}, { GH_TOKEN: 'env' }), 'env');
  assert.equal(resolveGithubToken({}, { POS_GH_TOKEN: 'alt' }), 'alt');
  assert.equal(resolveGithubToken({}, {}), null);
});

test('buildUpdaterRequestHeaders adds Authorization for GitHub when token set', () => {
  const headers = buildUpdaterRequestHeaders(
    { terminalId: 't1', terminalSecret: 's1' },
    { GH_TOKEN: 'ghp_test' },
  );
  assert.equal(headers.Authorization, 'token ghp_test');
  assert.equal(headers['X-Terminal-ID'], 't1');
});

test('buildUpdaterRequestHeaders omits Authorization for generic feed', () => {
  const headers = buildUpdaterRequestHeaders(
    { updateFeedUrl: 'https://cdn.example.com/pos' },
    { GH_TOKEN: 'ghp_test' },
  );
  assert.equal(headers.Authorization, undefined);
});
