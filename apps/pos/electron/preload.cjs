const { contextBridge } = require('electron');

const agentUrl = process.env.VITE_LOCAL_AGENT_URL ?? 'http://127.0.0.1:3456';

contextBridge.exposeInMainWorld('venuePos', {
  getAgentHealth: async () => {
    const res = await fetch(`${agentUrl}/health`);
    return res.json();
  },
  platform: process.platform,
});
