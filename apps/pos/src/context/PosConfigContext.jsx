import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setRuntimeConfig } from '../config.js';
import { readDevBrowserConfig } from '../setup/setup-bridge.js';

const PosConfigContext = createContext(null);

export function PosConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (window.venuePos?.getConfig) {
        const cfg = await window.venuePos.getConfig();
        setRuntimeConfig(cfg);
        setConfig(cfg);
        return cfg;
      }
      const browserCfg = readDevBrowserConfig();
      if (browserCfg) {
        setRuntimeConfig(browserCfg);
        setConfig(browserCfg);
        return browserCfg;
      }
      setConfig({
        apiUrl: import.meta.env.VITE_API_URL ?? '',
        agentUrl: import.meta.env.VITE_LOCAL_AGENT_URL ?? 'http://127.0.0.1:3456',
        terminalId: import.meta.env.VITE_TERMINAL_ID ?? '',
        terminalSecret: import.meta.env.VITE_TERMINAL_SECRET ?? '',
        setupComplete: Boolean(import.meta.env.VITE_TERMINAL_ID),
        kioskMode: import.meta.env.VITE_ELECTRON_IS_KIOSK !== 'false',
      });
      return null;
    } catch (err) {
      setError(err?.message ?? 'Failed to load config');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(
    () => ({
      config,
      loading,
      error,
      reload,
      isSetupComplete: Boolean(
        !config?.forceSetup &&
          config?.setupComplete &&
          config?.apiUrl &&
          config?.terminalId &&
          config?.terminalSecret &&
          config?.setupValidatedAt,
      ),
      forceSetup: Boolean(config?.forceSetup),
    }),
    [config, loading, error, reload],
  );

  return <PosConfigContext.Provider value={value}>{children}</PosConfigContext.Provider>;
}

export function usePosConfig() {
  const ctx = useContext(PosConfigContext);
  if (!ctx) throw new Error('usePosConfig must be used within PosConfigProvider');
  return ctx;
}
