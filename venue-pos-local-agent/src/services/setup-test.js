function normalizeUrl(url) {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

function agentUrlFromHost(host, port = 3456) {
  const h = String(host ?? '').trim() || '127.0.0.1';
  return `http://${h}:${port}`;
}

/**
 * Server-side hub + agent + terminal auth probe (no browser CORS).
 * Used by Electron main, local-agent setup route, and POS setup wizard.
 */
export async function testSetupConnections(cfg) {
  const results = { api: null, agent: null, terminal: null };
  const apiUrl = normalizeUrl(cfg.apiUrl);
  const agentUrl = cfg.agentUrl
    ? normalizeUrl(cfg.agentUrl)
    : agentUrlFromHost(cfg.agentLanHost, cfg.agentLanPort ?? 3456);

  if (!apiUrl) {
    results.api = { ok: false, error: 'apiUrl required' };
    return results;
  }

  try {
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(8000) });
    results.api = { ok: res.ok, status: res.status };
  } catch (err) {
    results.api = { ok: false, error: err.message };
  }

  try {
    const res = await fetch(`${agentUrl}/health`, { signal: AbortSignal.timeout(5000) });
    results.agent = { ok: res.ok, status: res.status };
  } catch (err) {
    results.agent = { ok: false, error: err.message };
  }

  if (cfg.terminalId && cfg.terminalSecret) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/features`, {
        headers: {
          'x-terminal-id': cfg.terminalId,
          'x-terminal-secret': cfg.terminalSecret,
        },
        signal: AbortSignal.timeout(8000),
      });
      results.terminal = { ok: res.ok, status: res.status };
    } catch (err) {
      results.terminal = { ok: false, error: err.message };
    }
  }

  return results;
}
