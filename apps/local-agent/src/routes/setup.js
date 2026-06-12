import { testSetupConnections } from '../services/setup-test.js';
import { probeCloudHealth, setCloudOnline } from '../services/cloud-health.js';
import { applySetupConfig } from '../services/runtime-config.js';
import { syncTerminalRosterFromServer } from '../services/terminal-cache.js';
import {
  isLocalSetupRequest,
  parseSaveBody,
  writeAgentEnvFile,
} from '../services/setup-provision.js';

function parseTestBody(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const apiUrl = String(raw.apiUrl ?? '').trim();
  if (!apiUrl) {
    return { error: 'apiUrl required' };
  }
  const agentLanPort = raw.agentLanPort != null ? Number(raw.agentLanPort) : undefined;
  if (agentLanPort != null && (!Number.isInteger(agentLanPort) || agentLanPort <= 0)) {
    return { error: 'agentLanPort must be a positive integer' };
  }
  return {
    value: {
      apiUrl,
      terminalId: raw.terminalId ? String(raw.terminalId) : undefined,
      terminalSecret: raw.terminalSecret ? String(raw.terminalSecret) : undefined,
      agentLanHost: raw.agentLanHost ? String(raw.agentLanHost) : undefined,
      agentLanPort,
    },
  };
}

export function registerSetupRoutes(app, { lanPort = 3456, db } = {}) {
  app.post('/v1/setup/test-connection', async (request, reply) => {
    const parsed = parseTestBody(request.body);
    if (parsed.error) {
      return reply.code(400).send({ error: { message: parsed.error } });
    }
    const body = parsed.value;
    const results = await testSetupConnections({
      apiUrl: body.apiUrl,
      terminalId: body.terminalId,
      terminalSecret: body.terminalSecret,
      agentLanHost: body.agentLanHost,
      agentLanPort: body.agentLanPort ?? lanPort,
    });
    return results;
  });

  app.post('/v1/setup/save-config', async (request, reply) => {
    if (!isLocalSetupRequest(request)) {
      return reply.code(403).send({ error: { message: 'Setup save is only allowed from localhost' } });
    }
    const parsed = parseSaveBody(request.body);
    if (parsed.error) {
      return reply.code(400).send({ error: { message: parsed.error } });
    }
    const envPath = writeAgentEnvFile(parsed.value);
    const applied = applySetupConfig(parsed.value);

    void (async () => {
      try {
        const { online } = await probeCloudHealth(applied.cloudHealthUrl, { force: true });
        setCloudOnline(online);
        if (online && applied.terminalId && applied.terminalSecret && db) {
          await syncTerminalRosterFromServer({
            db,
            apiUrl: applied.apiUrl,
            venueId: applied.venueId,
            terminalId: applied.terminalId,
            terminalSecret: applied.terminalSecret,
          });
        }
      } catch (err) {
        request.log.warn({ err }, 'Post-setup cloud sync failed');
      }
    })();

    return {
      ok: true,
      envPath,
      restartAgent: false,
      config: {
        apiUrl: applied.apiUrl,
        terminalId: applied.terminalId,
        venueId: applied.venueId,
        agentLanHost: parsed.value.agentLanHost,
        setupComplete: true,
        setupValidatedAt: parsed.value.setupValidatedAt,
      },
    };
  });
}
