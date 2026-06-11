/** Runtime till config — populated by PosConfigProvider / Electron IPC. */

let runtime = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  agentUrl: import.meta.env.VITE_LOCAL_AGENT_URL ?? 'http://127.0.0.1:3456',
  terminalId: import.meta.env.VITE_TERMINAL_ID ?? '',
  terminalSecret: import.meta.env.VITE_TERMINAL_SECRET ?? '',
};

export function setRuntimeConfig(cfg) {
  if (!cfg) return;
  runtime = {
    apiUrl: cfg.apiUrl || runtime.apiUrl,
    agentUrl: cfg.agentUrl || runtime.agentUrl,
    terminalId: cfg.terminalId ?? runtime.terminalId,
    terminalSecret: cfg.terminalSecret ?? runtime.terminalSecret,
  };
}

export function getRuntimeConfig() {
  return { ...runtime };
}

export const AGENT_URL = () => runtime.agentUrl;
export const API_URL = () => runtime.apiUrl;
export const TERMINAL_ID = () => runtime.terminalId;
export const TERMINAL_SECRET = () => runtime.terminalSecret;

/** @deprecated use getRuntimeConfig() — kept for gradual migration */
export const legacyAgentUrl = runtime.agentUrl;
export const legacyApiUrl = runtime.apiUrl;
