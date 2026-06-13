export const OPS_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

export const OPS_EVENT_TYPES = {
  TERMINAL_OFFLINE: 'terminal_offline',
  TERMINAL_ONLINE: 'terminal_online',
  SYNC_QUEUE_HIGH: 'sync_queue_high',
  SERVER_MEMORY_HIGH: 'server_memory_high',
  WATCHDOG_RESTART_STORM: 'watchdog_restart_storm',
  API_ERROR: 'api_error',
  AGENT_ERROR: 'agent_error',
};

/** Minimum sync queue depth before warning alert. */
export const OPS_SYNC_QUEUE_WARN = 25;

/** Server memory percent before warning. */
export const OPS_MEMORY_WARN_PERCENT = 85;

/** Dedupe window for repeated alerts (ms). */
export const OPS_ALERT_DEDUPE_MS = 15 * 60 * 1000;
