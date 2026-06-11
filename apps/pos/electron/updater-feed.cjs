/**
 * Feed URL helpers — no electron-updater import (safe for unit tests).
 */

/**
 * @param {{ updateFeedUrl?: string }} [cfg]
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveFeedUrl(cfg, env = process.env) {
  const fromCfg = String(cfg?.updateFeedUrl ?? '').trim();
  const fromEnv = String(env.POS_UPDATE_FEED_URL ?? '').trim();
  const url = (fromCfg || fromEnv).replace(/\/+$/, '');
  return url || null;
}

module.exports = { resolveFeedUrl };
