import os from 'node:os';

/** Best IPv4 for phone/LAN URLs — prefer real Wi‑Fi over WSL/Hyper-V adapters. */
export function pickDevLanHost() {
  const candidates = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push(net.address);
      }
    }
  }
  const pick = (prefix) => candidates.find((a) => a.startsWith(prefix));
  return pick('192.168.') ?? pick('10.') ?? pick('172.20.') ?? candidates[0] ?? null;
}
