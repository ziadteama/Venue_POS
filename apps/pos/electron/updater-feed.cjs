/**
 * Update feed resolution — no electron-updater import (safe for unit tests).
 */

const DEFAULT_GITHUB_OWNER = 'ziadteama';
const DEFAULT_GITHUB_REPO = 'Venue_POS';
const DEFAULT_GITHUB_RELEASES_URL = `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases`;

/**
 * @param {{ updateFeedUrl?: string }} [cfg]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
function resolveFeedUrl(cfg, env = process.env) {
  const fromCfg = String(cfg?.updateFeedUrl ?? '').trim();
  const fromEnv = String(env.POS_UPDATE_FEED_URL ?? '').trim();
  const url = (fromCfg || fromEnv).replace(/\/+$/, '');
  return url || null;
}

/**
 * @param {{ updateFeedUrl?: string }} [cfg]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ provider: 'generic', url: string } | { provider: 'github', owner: string, repo: string }}
 */
function resolveUpdateFeed(cfg, env = process.env) {
  const genericUrl = resolveFeedUrl(cfg, env);
  if (genericUrl) {
    return { provider: 'generic', url: genericUrl };
  }

  const owner = String(env.POS_GH_OWNER ?? DEFAULT_GITHUB_OWNER).trim() || DEFAULT_GITHUB_OWNER;
  const repo = String(env.POS_GH_REPO ?? DEFAULT_GITHUB_REPO).trim() || DEFAULT_GITHUB_REPO;
  return { provider: 'github', owner, repo };
}

module.exports = {
  DEFAULT_GITHUB_OWNER,
  DEFAULT_GITHUB_REPO,
  DEFAULT_GITHUB_RELEASES_URL,
  resolveFeedUrl,
  resolveUpdateFeed,
};
