import { normalizeUrl } from './setup-provision.js';

/** Mutable till credentials — updated live after setup wizard save (no agent restart). */
let runtime = {
  apiUrl: '',
  cloudHealthUrl: '',
  venueId: '',
  terminalId: '',
  terminalSecret: '',
};

export function initRuntimeConfig(cfg) {
  runtime = {
    apiUrl: cfg.apiUrl ?? '',
    cloudHealthUrl: cfg.cloudHealthUrl ?? '',
    venueId: cfg.venueId ?? '',
    terminalId: cfg.terminalId ?? '',
    terminalSecret: cfg.terminalSecret ?? '',
  };
}

export function getRuntimeConfig() {
  return { ...runtime };
}

export function applySetupConfig(cfg) {
  const apiUrl = normalizeUrl(cfg.apiUrl);
  runtime = {
    apiUrl,
    cloudHealthUrl: `${apiUrl}/health`,
    venueId: String(cfg.venueId ?? '').trim(),
    terminalId: String(cfg.terminalId ?? '').trim(),
    terminalSecret: String(cfg.terminalSecret ?? '').trim(),
  };
  return getRuntimeConfig();
}
