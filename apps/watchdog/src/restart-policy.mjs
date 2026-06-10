/**
 * Tracks POS restarts in a sliding window. ALERT when count exceeds maxRestarts.
 * @param {number} maxRestarts — alert when restarts in window > this value (default 3)
 * @param {number} windowMs — sliding window length (default 10 min)
 */
export function createRestartTracker(maxRestarts, windowMs) {
  /** @type {number[]} */
  const timestamps = [];

  return {
    /**
     * @param {number} [now]
     * @returns {{ count: number, alert: boolean }}
     */
    recordRestart(now = Date.now()) {
      timestamps.push(now);
      const cutoff = now - windowMs;
      while (timestamps.length > 0 && timestamps[0] < cutoff) {
        timestamps.shift();
      }
      const count = timestamps.length;
      const alert = count > maxRestarts;
      return { count, alert };
    },

    reset() {
      timestamps.length = 0;
    },
  };
}
